/**
 * SherpaAsrModule — 纯 JNI 的离线语音识别。
 *
 * 所有识别都在 Sherpa-ONNX（`com.k2fsa.sherpa.onnx`）里跑：
 *   - builtin：流式 Zipformer 14M zh，用 [OnlineRecognizer] 边说边出 partial。
 *   - upgrade：SenseVoice，用 [OfflineRecognizer]，麦克风短句 + 静音超时后 decode。
 *
 * 绝不走系统语音服务，也不发任何云端请求；识别全程本地。结果通过
 * `SherpaAsrEvent` 事件推给 JS 侧。
 */
package com.awesomeproject.bridge

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineSenseVoiceModelConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.io.File
import kotlin.concurrent.thread

class SherpaAsrModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val sampleRate = 16000

    @Volatile private var listening = false
    private var captureThread: Thread? = null
    private var record: AudioRecord? = null
    private var onlineRecognizer: OnlineRecognizer? = null
    private var offlineRecognizer: OfflineRecognizer? = null

    override fun getName(): String = "SherpaAsrModule"

    /** JS 端 NativeEventEmitter 要求存在这两个方法，实际不做订阅计数。 */
    @ReactMethod fun addListener(eventName: String) {}

    @ReactMethod fun removeListeners(count: Int) {}

    /**
     * @param packId "builtin"（流式 Zipformer）或 "upgrade"（SenseVoice）
     * @param modelDir 解压后模型目录，文件名必须来自 pins 的 files[].name
     */
    @ReactMethod
    fun start(packId: String, modelDir: String, promise: Promise) {
        if (listening) {
            promise.resolve(null)
            return
        }
        if (!hasMicPermission()) {
            emitError("no_permission")
            promise.resolve(null)
            return
        }
        try {
            when (packId) {
                "builtin" -> startStreaming(modelDir)
                "upgrade" -> startOffline(modelDir)
                else -> {
                    emitError("engine_failed")
                    promise.resolve(null)
                    return
                }
            }
            promise.resolve(null)
        } catch (e: Throwable) {
            Log.e(TAG, "start($packId) failed", e)
            cleanup()
            emitError("engine_failed")
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        listening = false
        try {
            captureThread?.join(1500)
        } catch (_: InterruptedException) {
        }
        cleanup()
        promise.resolve(null)
    }

    private fun startStreaming(modelDir: String) {
        val recognizer = OnlineRecognizer(
            config = OnlineRecognizerConfig(
                featConfig = FeatureConfig(sampleRate = sampleRate, featureDim = 80),
                modelConfig = OnlineModelConfig(
                    transducer = OnlineTransducerModelConfig(
                        encoder = pathIn(modelDir, "encoder-epoch-99-avg-1.int8.onnx"),
                        decoder = pathIn(modelDir, "decoder-epoch-99-avg-1.onnx"),
                        joiner = pathIn(modelDir, "joiner-epoch-99-avg-1.int8.onnx"),
                    ),
                    tokens = pathIn(modelDir, "tokens.txt"),
                    numThreads = 2,
                    modelType = "zipformer",
                ),
                enableEndpoint = true,
            ),
        )
        onlineRecognizer = recognizer

        val recorder = openRecorder()
        record = recorder
        listening = true
        recorder.startRecording()

        captureThread = thread(name = "sherpa-asr-online") {
            val stream = recognizer.createStream()
            val buffer = ShortArray(sampleRate / 10)
            var lastText = ""
            while (listening) {
                val n = recorder.read(buffer, 0, buffer.size)
                if (n <= 0) continue
                stream.acceptWaveform(toFloats(buffer, n), sampleRate)
                while (recognizer.isReady(stream)) {
                    recognizer.decode(stream)
                }
                val text = recognizer.getResult(stream).text
                if (text.isNotEmpty() && text != lastText) {
                    lastText = text
                    emitPartial(text)
                }
                if (recognizer.isEndpoint(stream)) {
                    if (lastText.isNotEmpty()) {
                        emitFinal(lastText, "builtin")
                    }
                    recognizer.reset(stream)
                    lastText = ""
                }
            }
            stream.release()
        }
    }

    private fun startOffline(modelDir: String) {
        val recognizer = OfflineRecognizer(
            config = OfflineRecognizerConfig(
                featConfig = FeatureConfig(sampleRate = sampleRate, featureDim = 80),
                modelConfig = OfflineModelConfig(
                    senseVoice = OfflineSenseVoiceModelConfig(
                        model = pathIn(modelDir, "model.int8.onnx"),
                        useInverseTextNormalization = true,
                    ),
                    tokens = pathIn(modelDir, "tokens.txt"),
                    numThreads = 2,
                    modelType = "sense_voice",
                ),
            ),
        )
        offlineRecognizer = recognizer

        val recorder = openRecorder()
        record = recorder
        listening = true
        recorder.startRecording()

        captureThread = thread(name = "sherpa-asr-offline") {
            val samples = ArrayList<Float>()
            val buffer = ShortArray(sampleRate / 10)
            var silentChunks = 0
            var voicedChunks = 0
            while (listening) {
                val n = recorder.read(buffer, 0, buffer.size)
                if (n <= 0) continue
                val floats = toFloats(buffer, n)
                for (v in floats) samples.add(v)
                if (rms(floats) >= SILENCE_RMS) {
                    voicedChunks++
                    silentChunks = 0
                } else {
                    silentChunks++
                }
                // 说过话后连续静音超过阈值 → 收尾解码这一句。
                if (voicedChunks > 0 && silentChunks >= SILENCE_CHUNKS) {
                    break
                }
            }
            if (voicedChunks > 0 && samples.isNotEmpty()) {
                val stream = recognizer.createStream()
                stream.acceptWaveform(samples.toFloatArray(), sampleRate)
                recognizer.decode(stream)
                val text = recognizer.getResult(stream).text
                stream.release()
                if (text.isNotEmpty()) {
                    emitFinal(text, "upgrade")
                }
            }
            listening = false
        }
    }

    private fun openRecorder(): AudioRecord {
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        return AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, sampleRate),
        )
    }

    private fun cleanup() {
        try {
            record?.stop()
        } catch (_: Throwable) {
        }
        record?.release()
        record = null
        onlineRecognizer?.release()
        onlineRecognizer = null
        offlineRecognizer?.release()
        offlineRecognizer = null
        captureThread = null
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

    private fun pathIn(dir: String, name: String): String =
        File(dir, name).absolutePath

    private fun toFloats(buffer: ShortArray, n: Int): FloatArray {
        val out = FloatArray(n)
        for (i in 0 until n) out[i] = buffer[i] / 32768.0f
        return out
    }

    private fun rms(samples: FloatArray): Float {
        if (samples.isEmpty()) return 0f
        var sum = 0.0
        for (v in samples) sum += (v * v).toDouble()
        return Math.sqrt(sum / samples.size).toFloat()
    }

    private fun emitPartial(text: String) {
        val map = Arguments.createMap()
        map.putString("type", "partial")
        map.putString("text", text)
        emit(map)
    }

    private fun emitFinal(text: String, packId: String) {
        val map = Arguments.createMap()
        map.putString("type", "final")
        map.putString("text", text)
        map.putString("packId", packId)
        emit(map)
    }

    private fun emitError(code: String) {
        val map = Arguments.createMap()
        map.putString("type", "error")
        map.putString("code", code)
        emit(map)
    }

    private fun emit(map: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, map)
    }

    companion object {
        private const val TAG = "SherpaAsrModule"
        private const val EVENT_NAME = "SherpaAsrEvent"
        private const val SILENCE_RMS = 0.01f
        private const val SILENCE_CHUNKS = 8 // ~0.8s of trailing silence ends an utterance
    }
}
