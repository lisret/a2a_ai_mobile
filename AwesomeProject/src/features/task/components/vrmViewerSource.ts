import {Platform} from 'react-native';

const ELEL_VRM_CID = 'QmSpb8jZRtwDhpp7zjpfvU47GZyapmh8GvQApmzTxFcaLz';

export const ELEL_VRM_FILE_URL =
  `https://ipfs.io/ipfs/${ELEL_VRM_CID}/Avatar01_Neutral.vrm`;

const IOS_VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style>
</head>
<body>
<script src="https://unpkg.com/three@0.140.2/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.140.2/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://unpkg.com/three@0.140.2/examples/js/controls/OrbitControls.js"></script>
<script src="https://unpkg.com/@pixiv/three-vrm@0.6.11/lib/three-vrm.min.js"></script>
<script>
${/* same runtime as android/assets/vrm/index.html, VRM path is same-origin via baseUrl */ ''}
(function(){
  function post(payload){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(payload))}catch(e){}}
  var renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  if(THREE.sRGBEncoding)renderer.outputEncoding=THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(32,window.innerWidth/window.innerHeight,0.05,30);
  camera.position.set(0,0.92,1.55);
  scene.add(new THREE.AmbientLight(0xffffff,0.7));
  var key=new THREE.DirectionalLight(0xfff4e8,0.85);key.position.set(0.5,1.6,1.1);scene.add(key);
  var controls=new THREE.OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=true;
  controls.target.set(0,0.78,0);controls.minPolarAngle=Math.PI*0.44;controls.maxPolarAngle=Math.PI*0.56;
  controls.minAzimuthAngle=-0.75;controls.maxAzimuthAngle=0.75;controls.update();
  var clock=new THREE.Clock();var currentVrm=null;var mood='idle';
  function setBlend(n,v){if(!currentVrm||!currentVrm.blendShapeProxy)return;try{currentVrm.blendShapeProxy.setValue(n,v)}catch(e){}}
  window.__setMood=function(next){mood=next||'idle';['fun','joy','angry','sorrow','a'].forEach(function(n){setBlend(n,0)});if(mood==='done'){setBlend('fun',0.55);setBlend('joy',0.4)}else if(mood==='error'){setBlend('sorrow',0.75)}else if(mood==='work'){setBlend('a',0.2)}};
  var loader=new THREE.GLTFLoader();
  loader.load('Avatar01_Neutral.vrm',function(gltf){
    if(!window.THREE_VRM||!THREE_VRM.VRM||!THREE_VRM.VRM.from){post({type:'error',message:'THREE_VRM missing'});return}
    THREE_VRM.VRM.from(gltf).then(function(vrm){
      currentVrm=vrm;
      if(THREE_VRM.VRMUtils&&THREE_VRM.VRMUtils.rotateVRM0)THREE_VRM.VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);if(vrm.lookAt)vrm.lookAt.target=camera;window.__setMood(mood);post({type:'ready'});
    }).catch(function(err){post({type:'error',message:String(err)})});
  },undefined,function(err){post({type:'error',message:String(err)})});
  function animate(){requestAnimationFrame(animate);var dt=clock.getDelta();var t=clock.elapsedTime;if(currentVrm){var c=t%4.4;setBlend('blink',c>4.15&&c<4.28?1:0);currentVrm.scene.position.y=Math.sin(t*1.35)*0.012;if(currentVrm.update)currentVrm.update(dt)}controls.update();renderer.render(scene,camera)}
  animate();
  window.addEventListener('resize',function(){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
  window.addEventListener('error',function(e){post({type:'error',message:e.message||'js error'})});
})();
</script>
</body>
</html>`;

export function getElelVrmWebViewSource() {
  if (Platform.OS === 'android') {
    return {uri: 'file:///android_asset/vrm/index.html'};
  }
  return {
    html: IOS_VIEWER_HTML,
    baseUrl: `https://ipfs.io/ipfs/${ELEL_VRM_CID}/`,
  };
}
