import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { AccessibilityActionModule } = NativeModules;

import { STORAGE_KEYS } from '@shared/constants';

const APP_MAPPING_CACHE_KEY = `${STORAGE_KEYS.SETTINGS_PREFIX}app_mapping_cache`;
const APP_MAPPING_CACHE_TIMESTAMP_KEY = `${STORAGE_KEYS.SETTINGS_PREFIX}app_mapping_cache_timestamp`;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24小时缓存有效期

interface AppMapping {
  [appName: string]: string; // 应用名称 -> 包名
}


/**
 * 硬编码的应用映射表（兜底方案）
 * 当动态获取的应用映射表无法找到应用时，使用此映射表
 */
const HARDCODED_APP_MAPPING: AppMapping = {
  "天气": "com.coloros.weather2",
  "家人守护": "com.coloros.familyguard",
  "百度极速版": "com.baidu.searchbox.lite",
  "58同城": "com.wuba",
  "计算器": "com.coloros.calculator",
  "掌上生活": "com.cmbchina.ccd.pluto.cmbActivity",
  "飞猪旅行": "com.taobao.trip",
  "网易有道词典": "com.youdao.dict",
  "百度贴吧": "com.baidu.tieba",
  "百度输入法": "com.baidu.input",
  "酷我音乐": "cn.kuwo.player",
  "oppo社区": "com.oppo.community",
  "夸克": "com.quark.browser",
  "邮件": "com.android.email",
  "剪映": "com.lemon.lv",
  "酷狗概念版": "com.kugou.android.lite",
  "酷狗音乐": "com.kugou.android",
  "网易邮箱大师": "com.netease.mail",
  "yy": "com.duowan.mobile",
  "qq": "com.tencent.mobileqq",
  "小宇宙": "app.podcast.cosmos",
  "指南针": "com.coloros.compass2",
  "oppo视频": "com.heytap.yoli",
  "天猫": "com.tmall.wireless",
  "抖音商城": "com.ss.android.ugc.livelite",
  "点淘": "com.taobao.live",
  "录音": "com.coloros.soundrecorder",
  "哔哩哔哩": "tv.danmaku.bili",
  "B站": "tv.danmaku.bili",
  "soul": "cn.soulapp.android",
  "懂车帝": "com.ss.android.auto",
  "咪咕视频": "com.cmcc.cmvideo",
  "微信读书": "com.tencent.weread",
  "蘑菇街": "com.mogujie",
  "云闪付": "com.unionpay",
  "好看视频": "com.baidu.haokan",
  "AIAgentDemo": "com.stepfun.aiagent.demo",
  "qq浏览器": "com.tencent.mtt",
  "文件管理": "com.coloros.filemanager",
  "日历": "com.coloros.calendar",
  "游戏助手": "com.oplus.games",
  "中国联通": "com.sinovatech.unicom.ui",
  "主题商店": "com.heytap.themestore",
  "红袖读书": "com.hongxiu.app",
  "全民K歌": "com.tencent.karaoke",
  "抖音火山版": "com.ss.android.ugc.live",
  "美图秀秀": "com.mt.mtxx.mtxx",
  "拾程旅行": "com.hnjw.shichengtravel",
  "中国电信": "com.ct.client",
  "时钟": "com.coloros.alarmclock",
  "快对": "com.kuaiduizuoye.scan",
  "钱包": "com.finshell.wallet",
  "快手极速版": "com.kuaishou.nebula",
  "文件随心开": "cn.wps.moffice.lite",
  "墨迹天气": "com.moji.mjweather",
  "kimi 智能助手": "com.moonshot.kimichat",
  "起点读书": "com.qidian.QDReader",
  "逍遥游": "com.redteamobile.roaming",
  "平安好车主": "com.pingan.carowner",
  "银联可信服务安全组件": "com.unionpay.tsmservice",
  "腾讯微视": "com.tencent.weishi",
  "网上国网": "com.sgcc.wsgw.cn",
  "作业帮": "com.baidu.homework",
  "阅读": "com.heytap.reader",
  "蜻蜓FM": "fm.qingting.qtradio",
  "禅定空间": "com.oneplus.brickmode",
  "腾讯地图": "com.tencent.map",
  "虎牙直播": "com.duowan.kiwi",
  "番茄畅听音乐版": "com.xs.fm.lite",
  "今日头条极速版": "com.ss.android.article.lite",
  "转转": "com.wuba.zhuanzhuan",
  "便签": "com.coloros.note",
  "UC浏览器": "com.UCMobile",
  "百度文库": "com.baidu.wenku",
  "小猿搜题": "com.fenbi.android.solar",
  "腾讯文档": "com.tencent.docs",
  "携程旅行": "ctrip.android.view",
  "wpsoffice": "cn.wps.moffice_eng",
  "哈啰": "com.jingyao.easybike",
  "中国移动": "com.greenpoint.android.mc10086.activity",
  "唯品会": "com.achievo.vipshop",
  "手机 搬家": "com.coloros.backuprestore",
  "安逸花": "com.msxf.ayh",
  "音乐": "com.heytap.music",
  "小猿口算": "com.fenbi.android.leo",
  "MOMO陌陌": "cn.soulapp.android",
  "支付宝": "com.eg.android.AlipayGphone",
  "DataCollection": "com.example.datacollection",
  "番茄畅听": "com.xs.fm",
  "语音翻译": "com.coloros.translate",
  "无线耳机": "com.oplus.melody",
  "得物": "com.shizhuang.duapp",
  "西瓜视频": "com.ss.android.article.video",
  "网易新闻": "com.netease.newsreader.activity",
  "淘宝特价版": "com.taobao.litetao",
  "自如": "com.ziroom.ziroomcustomer",
  "爱奇艺极速版": "com.qiyi.video.lite",
  "斗鱼": "air.tv.douyu.android",
  "扫描全能王": "com.intsig.camscanner",
  "买单吧": "com.bankcomm.maidanba",
  "飞连": "com.volcengine.corplink",
  "菜鸟": "com.cainiao.wireless",
  "盒马": "com.wudaokou.hippo",
  "阿里巴巴": "com.alibaba.wireless",
  "智能家居": "com.heytap.smarthome",
  "小布指令": "com.coloros.shortcuts",
  "闲鱼": "com.taobao.idlefish",
  "游戏中心": "com.nearme.gamecenter",
  "搜狗输入法": "com.sohu.inputmethod.sogou",
  "百度网盘": "com.baidu.netdisk",
  "QC浏览器": "com.fjhkf.gxdsmls",
  "酷安": "com.coolapk.market",
  "百度": "com.baidu.searchbox",
  "抖音极速版": "com.ss.android.ugc.aweme.lite",
  "OPPO商城": "com.oppo.store",
  "自由收藏": "com.coloros.favorite",
  "我的OPPO": "com.oplus.member",
  "掌阅": "com.chaozh.iReaderFree",
  "腾讯会议": "com.tencent.wemeet.app",
  "企业微信": "com.tencent.wework",
  "健康": "com.heytap.health",
  "搜狐视频": "com.sohu.sohuvideo",
  "山姆会员商店": "cn.samsclub.app",
  "大麦": "cn.damai",
  "醒图": "com.ss.android.picshow",
  "设置": "com.android.settings",
  "王者荣耀": "com.tencent.tmgp.sgame",
  "随手记": "com.mymoney",
  "钢琴块二": "com.cmplay.tiles2_cn",
  "麦当劳": "com.mcdonalds.gma.cn",
  "寻艺": "com.vlinkage.xunyee",
  "京东到家": "com.jingdong.pdj",
  "小象超市": "com.meituan.retail.v.android",
  "京东金融": "com.jd.jrapp",
  "猫眼": "com.sankuai.movie",
  "红果免费短剧": "com.phoenix.read",
  "三角洲行动": "com.tencent.tmgp.dfm",
  "航旅纵横": "com.umetrip.android.msky.app",
  "淘票票": "com.taobao.movie.android",
  "学习强国": "cn.xuexi.android",
  "小米商城": "com.xiaomi.shop",
  "浏览器": "com.android.browser",
  "look": "com.vision.haokan",
  "什么值得买": "com.smzdm.client.android",
  "妙兜": "com.agent.miaodou",
  "瑞幸咖啡": "com.lucky.luckyclient",
  "豆瓣阅读": "com.douban.book.reader",
  "钉钉": "com.alibaba.android.rimet",
  "达美乐披萨": "com.android.permissioncontroller",
  "同程旅行": "com.tongcheng.android",
  "opentracks": "de.dennisguse.opentracks",
  "miniwob": "com.google.androidenv.miniwob",
  "simple gallery pro": "com.simplemobiletools.gallery.pro",
  "simple gallery": "com.simplemobiletools.gallery.pro",
  "gallery": "com.simplemobiletools.gallery.pro",
  "audio recorder": "com.dimowner.audiorecorder",
  "simple calendar pro": "com.simplemobiletools.calendar.pro",
  "simple draw pro": "com.simplemobiletools.draw.pro",
  "draw": "com.simplemobiletools.draw.pro",
  "clipper": "ca.zgrs.clipper",
  "retro music": "code.name.monkey.retromusic",
  "arduia pro expense": "com.arduia.expense",
  "markor": "net.gsantner.markor",
  "tasks": "org.tasks",
  "osmAnd": "net.osmand",
  "给到": "com.guanaitong",
  "百词斩": "com.jiongji.andriod.card",
  "QQ": "com.tencent.mobileqq",
  "淘宝闪购": "com.taobao.taobao",
  "京东秒送": "com.jingdong.app.mall",
  "12306": "com.MobileTicket",
  "去哪儿": "com.Qunar",
  "bilibili": "tv.danmaku.bili",
  "红果短剧": "com.phoenix.read",
  "番茄小说": "com.dragon.read",
  "贝壳找房": "com.lianjia.beike",
  "安居客": "com.anjuke.android.app",
  "同花顺": "com.hexin.plat.android",
  "星穹铁道": "com.miHoYo.hkrpg",
  "崩坏：星穹铁道": "com.miHoYo.hkrpg",
  "恋与深空": "com.papegames.lysk.cn",
  "AndroidSystemSettings": "com.android.settings",
  "Android System Settings": "com.android.settings",
  "Android  System Settings": "com.android.settings",
  "Android-System-Settings": "com.android.settings",
  "Settings": "com.android.settings",
  "AudioRecorder": "com.android.soundrecorder",
  "audiorecorder": "com.android.soundrecorder",
  "Bluecoins": "com.rammigsoftware.bluecoins",
  "bluecoins": "com.rammigsoftware.bluecoins",
  "Broccoli": "com.flauschcode.broccoli",
  "Booking.com": "com.booking",
  "Booking": "com.booking",
  "booking.com": "com.booking",
  "booking": "com.booking",
  "BOOKING.COM": "com.booking",
  "Chrome": "com.android.chrome",
  "chrome": "com.android.chrome",
  "Google Chrome": "com.android.chrome",
  "Clock": "com.android.deskclock",
  "clock": "com.android.deskclock",
  "Contacts": "com.android.contacts",
  "contacts": "com.android.contacts",
  "Duolingo": "com.duolingo",
  "duolingo": "com.duolingo",
  "Expedia": "com.expedia.bookings",
  "expedia": "com.expedia.bookings",
  "Files": "com.android.fileexplorer",
  "files": "com.android.fileexplorer",
  "File Manager": "com.android.fileexplorer",
  "file manager": "com.android.fileexplorer",
  "gmail": "com.google.android.gm",
  "Gmail": "com.google.android.gm",
  "GoogleMail": "com.google.android.gm",
  "Google Mail": "com.google.android.gm",
  "GoogleFiles": "com.google.android.apps.nbu.files",
  "googlefiles": "com.google.android.apps.nbu.files",
  "FilesbyGoogle": "com.google.android.apps.nbu.files",
  "GoogleCalendar": "com.google.android.calendar",
  "Google-Calendar": "com.google.android.calendar",
  "Google Calendar": "com.google.android.calendar",
  "google-calendar": "com.google.android.calendar",
  "google calendar": "com.google.android.calendar",
  "GoogleChat": "com.google.android.apps.dynamite",
  "Google Chat": "com.google.android.apps.dynamite",
  "Google-Chat": "com.google.android.apps.dynamite",
  "GoogleClock": "com.google.android.deskclock",
  "Google Clock": "com.google.android.deskclock",
  "Google-Clock": "com.google.android.deskclock",
  "GoogleContacts": "com.google.android.contacts",
  "Google-Contacts": "com.google.android.contacts",
  "Google Contacts": "com.google.android.contacts",
  "google-contacts": "com.google.android.contacts",
  "google contacts": "com.google.android.contacts",
  "GoogleDocs": "com.google.android.apps.docs.editors.docs",
  "Google Docs": "com.google.android.apps.docs.editors.docs",
  "googledocs": "com.google.android.apps.docs.editors.docs",
  "google docs": "com.google.android.apps.docs.editors.docs",
  "Google Drive": "com.google.android.apps.docs",
  "Google-Drive": "com.google.android.apps.docs",
  "google drive": "com.google.android.apps.docs",
  "google-drive": "com.google.android.apps.docs",
  "GoogleDrive": "com.google.android.apps.docs",
  "Googledrive": "com.google.android.apps.docs",
  "googledrive": "com.google.android.apps.docs",
  "GoogleFit": "com.google.android.apps.fitness",
  "googlefit": "com.google.android.apps.fitness",
  "GoogleKeep": "com.google.android.keep",
  "googlekeep": "com.google.android.keep",
  "GoogleMaps": "com.google.android.apps.maps",
  "Google Maps": "com.google.android.apps.maps",
  "googlemaps": "com.google.android.apps.maps",
  "google maps": "com.google.android.apps.maps",
  "Google Play Books": "com.google.android.apps.books",
  "Google-Play-Books": "com.google.android.apps.books",
  "google play books": "com.google.android.apps.books",
  "google-play-books": "com.google.android.apps.books",
  "GooglePlayBooks": "com.google.android.apps.books",
  "googleplaybooks": "com.google.android.apps.books",
  "GooglePlayStore": "com.android.vending",
  "Google Play Store": "com.android.vending",
  "Google-Play-Store": "com.android.vending",
  "GoogleSlides": "com.google.android.apps.docs.editors.slides",
  "Google Slides": "com.google.android.apps.docs.editors.slides",
  "Google-Slides": "com.google.android.apps.docs.editors.slides",
  "GoogleTasks": "com.google.android.apps.tasks",
  "Google Tasks": "com.google.android.apps.tasks",
  "Google-Tasks": "com.google.android.apps.tasks",
  "Joplin": "net.cozic.joplin",
  "McDonald": "com.mcdonalds.app",
  "mcdonald": "com.mcdonalds.app",
  "Osmand": "net.osmand",
  "osmand": "net.osmand",
  "PiMusicPlayer": "com.Project100Pi.themusicplayer",
  "pimusicplayer": "com.Project100Pi.themusicplayer",
  "Quora": "com.quora.android",
  "quora": "com.quora.android",
  "Reddit": "com.reddit.frontpage",
  "reddit": "com.reddit.frontpage",
  "RetroMusic": "code.name.monkey.retromusic",
  "retromusic": "code.name.monkey.retromusic",
  "SimpleCalendarPro": "com.scientificcalculatorplus.simplecalculator.basiccalculator.mathcalc",
  "SimpleSMSMessenger": "com.simplemobiletools.smsmessenger",
  "Telegram": "org.telegram.messenger",
  "temu": "com.einnovation.temu",
  "Temu": "com.einnovation.temu",
  "Tiktok": "com.zhiliaoapp.musically",
  "tiktok": "com.zhiliaoapp.musically",
  "Twitter": "com.twitter.android",
  "twitter": "com.twitter.android",
  "X": "com.twitter.android",
  "VLC": "org.videolan.vlc",
  "WeChat": "com.tencent.mm",
  "wechat": "com.tencent.mm",
  "Whatsapp": "com.whatsapp",
  "WhatsApp": "com.whatsapp",
  // 社交和消息
  '微信': 'com.tencent.mm',
  '微博': 'com.sina.weibo',
  'weibo': 'com.sina.weibo',
  'telegram': 'org.telegram.messenger',
  'whatsapp': 'com.whatsapp',
  // 电商
  '淘宝': 'com.taobao.taobao',
  'taobao': 'com.taobao.taobao',
  '京东': 'com.jingdong.app.mall',
  '拼多多': 'com.xunmeng.pinduoduo',
  
  // 生活方式和社交
  '小红书': 'com.xingin.xhs',
  'xhs': 'com.xingin.xhs',
  '豆瓣': 'com.douban.frodo',
  '知乎': 'com.zhihu.android',
  
  // 地图和导航
  '高德地图': 'com.autonavi.minimap',
  '百度地图': 'com.baidu.BaiduMap',
  
  // 食品和服务
  '美团': 'com.sankuai.meituan',
  'meituan': 'com.sankuai.meituan',
  '大众点评': 'com.dianping.v1',
  '饿了么': 'me.ele',
  'eleme': 'me.ele',
  '肯德基': 'com.yek.android.kfc.activitys',
  
  // 旅行
  '携程': 'ctrip.android.view',
  '铁路12306': 'com.MobileTicket',
  '去哪儿旅行': 'com.Qunar',
  '滴滴出行': 'com.sdu.didi.psnger',
  
  // 视频和娱乐
  '抖音': 'com.ss.android.ugc.aweme',
  'douyin': 'com.ss.android.ugc.aweme',
  '快手': 'com.smile.gifmaker',
  '腾讯视频': 'com.tencent.qqlive',
  '爱奇艺': 'com.qiyi.video',
  '优酷视频': 'com.youku.phone',
  '芒果TV': 'com.hunantv.imgo.activity',
  
  // 音乐和音频
  '网易云音乐': 'com.netease.cloudmusic',
  'QQ音乐': 'com.tencent.qqmusic',
  '汽水音乐': 'com.luna.music',
  '喜马拉雅': 'com.ximalaya.ting.android',
  
  // 阅读
  '番茄免费小说': 'com.dragon.read',
  '七猫免费小说': 'com.kmxs.reader',
  
  // 生产力
  '飞书': 'com.ss.android.lark',
  'QQ邮箱': 'com.tencent.androidqqmail',
  'Google Keep': 'com.google.android.keep',
  'joplin': 'net.cozic.joplin',
  
  // AI和工具
  '豆包': 'com.larus.nova',
  
  // 健康和健身
  'keep': 'com.gotokeep.keep',
  'Keep': 'com.gotokeep.keep',
  '美柚': 'com.lingan.seeyou',
  'Google Fit': 'com.google.android.apps.fitness',
  
  // 新闻和信息
  '腾讯新闻': 'com.tencent.news',
  '今日头条': 'com.ss.android.article.news',
  
  // 金融
  'alipay': 'com.eg.android.AlipayGphone',
  
  // 系统应用
  'settings': 'com.android.settings',
  '录音机': 'com.android.soundrecorder',
  '联系人': 'com.android.contacts',
  'Google Files': 'com.google.android.apps.nbu.files',
  
  // 浏览器
  'browser': 'com.android.browser',
  
  // 其他应用

  'broccoli': 'com.flauschcode.broccoli',
  "WPS": "cn.wps.moffice_eng",
  "wps": "cn.wps.moffice_eng",
  "WPS Office": "cn.wps.moffice_eng",
}
/**
 * 应用映射服务
 * 用于缓存和管理已安装应用的包名映射表
 */
class AppMappingService {
  private cachedMapping: AppMapping | null = null;
  private cacheTimestamp: number | null = null;

  /**
   * 从原生模块获取所有已安装应用列表（使用混合多重策略）
   * 优先使用混合方法，如果失败则回退到标准方法
   */
  async fetchAllInstalledApps(): Promise<AppMapping> {
    if (Platform.OS !== 'android' || !AccessibilityActionModule) {
      throw new Error('获取应用列表仅支持Android平台');
    }

    // 策略1: 优先使用QUERY_ALL_PACKAGES权限方法（最正规的方案，Android 11+推荐）
    if (AccessibilityActionModule.getAllInstalledAppsWithQueryAllPackages) {
      try {
        console.info('[应用映射服务] 尝试使用QUERY_ALL_PACKAGES权限方法获取应用列表（最正规方案）');
        const appsMap = await AccessibilityActionModule.getAllInstalledAppsWithQueryAllPackages();
        
        if (appsMap && Object.keys(appsMap).length > 0) {
          const appCount = Object.keys(appsMap).length;
          console.info(`[应用映射服务] QUERY_ALL_PACKAGES方法获取成功，共 ${appCount} 个应用`);
          return appsMap as AppMapping;
        }
      } catch (error: any) {
        // 如果是权限不足错误，继续尝试其他方法
        if (error?.message?.includes('QUERY_ALL_PACKAGES权限不足') || error?.message?.includes('SecurityException')) {
          console.warn('[应用映射服务] QUERY_ALL_PACKAGES权限不足，尝试标准方法:', error);
        } else {
          console.warn('[应用映射服务] QUERY_ALL_PACKAGES方法失败，尝试标准方法:', error);
        }
      }
    }

    // 策略2: 使用标准方法（不使用QUERY_ALL_PACKAGES权限）
    try {
      console.info('[应用映射服务] 尝试使用标准方法获取应用列表（不使用QUERY_ALL_PACKAGES权限）');
      const appsMap = await AccessibilityActionModule.getAllInstalledApps();
      
      if (appsMap && Object.keys(appsMap).length > 0) {
        const appCount = Object.keys(appsMap).length;
        console.info(`[应用映射服务] 标准方法获取成功，共 ${appCount} 个应用`);
        
        // 如果获取的应用数量合理（大于10个），直接返回
        // 如果数量太少，可能是权限问题，尝试降级方案
        if (appCount >= 10) {
          return appsMap as AppMapping;
        } else {
          console.warn(`[应用映射服务] 标准方法获取的应用数量较少（${appCount}个），可能不完整，尝试降级方案`);
        }
      }
    } catch (error) {
      console.warn('[应用映射服务] 标准方法失败，尝试降级方案:', error);
    }

    // 策略3: 降级到混合多重策略方法（补充方案）
    try {
      console.info('[应用映射服务] 使用混合多重策略方法获取应用列表（降级方案）');
      const appsMap = await AccessibilityActionModule.getAllInstalledAppsHybrid();
      
      if (appsMap && Object.keys(appsMap).length > 0) {
        console.info(`[应用映射服务] 混合策略获取成功，共 ${Object.keys(appsMap).length} 个应用`);
        return appsMap as AppMapping;
      }
    } catch (error) {
      console.error('[应用映射服务] 混合策略方法也失败:', error);
    }

    // 所有方法都失败
    throw new Error('获取应用列表失败：QUERY_ALL_PACKAGES方法、标准方法和降级方案都失败');
  }

  /**
   * 从缓存加载应用映射表
   */
  private async loadFromCache(): Promise<AppMapping | null> {
    try {
      const [mappingStr, timestampStr] = await Promise.all([
        AsyncStorage.getItem(APP_MAPPING_CACHE_KEY),
        AsyncStorage.getItem(APP_MAPPING_CACHE_TIMESTAMP_KEY),
      ]);

      if (!mappingStr || !timestampStr) {
        return null;
      }

      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();

      // 检查缓存是否过期
      if (now - timestamp > CACHE_EXPIRY_MS) {
        console.info('[应用映射服务] 缓存已过期，需要重新获取');
        return null;
      }

      const mapping = JSON.parse(mappingStr) as AppMapping;
      return mapping;
    } catch (error) {
      console.error('[应用映射服务] 加载缓存失败:', error);
      return null;
    }
  }

  /**
   * 保存应用映射表到缓存
   */
  private async saveToCache(mapping: AppMapping): Promise<void> {
    try {
      const now = Date.now();
      await Promise.all([
        AsyncStorage.setItem(APP_MAPPING_CACHE_KEY, JSON.stringify(mapping)),
        AsyncStorage.setItem(APP_MAPPING_CACHE_TIMESTAMP_KEY, now.toString()),
      ]);
      this.cachedMapping = mapping;
      this.cacheTimestamp = now;
      console.info('[应用映射服务] 应用映射表已缓存，共', Object.keys(mapping).length, '个应用');
    } catch (error) {
      console.error('[应用映射服务] 保存缓存失败:', error);
    }
  }

  /**
   * 清理映射表：去除应用名和包名重复的条目
   */
  private cleanMapping(mapping: AppMapping): AppMapping {
    const cleaned: AppMapping = {};
    let removedCount = 0;
    
    for (const [appName, packageName] of Object.entries(mapping)) {
      // 如果应用名和包名相同，跳过
      // 同时检查空字符串和 null/undefined 的情况
      if (!appName || !packageName || appName === packageName || appName.trim() === packageName.trim()) {
        removedCount++;
        continue;
      }
      cleaned[appName] = packageName;
    }
    
    if (removedCount > 0) {
      console.info(`[应用映射服务] 已移除 ${removedCount} 个应用名和包名重复的条目`);
    }
    
    return cleaned;
  }

  /**
   * 融合硬编码映射表到系统映射表
   * 新逻辑：
   * 1. 先获取系统应用映射表
   * 2. 然后获取硬编码映射表应用的包名去匹配是否存在一样的
   *    包名一致的情况下：
   *    - 系统侧应用名称和包名一致，则用硬编码的应用名称替换掉
   *    - 系统侧应用名称和包名不一致，则检查系统侧应用名和硬编码应用名是否一致：
   *      * 不一致则添加进去（硬编码的应用名作为新的key）
   *      * 一致则跳过
   * 3. 然后将那些没有匹配成功的且包名和应用名一致的剔除
   */
  private mergeHardcodedMapping(systemMapping: AppMapping): AppMapping {
    const merged = { ...systemMapping };
    let replacedCount = 0;
    let addedCount = 0;
    let skippedCount = 0;
    const matchedPackageNames = new Set<string>(); // 记录已匹配的包名
    
    // 步骤1: 遍历硬编码映射表，通过包名匹配系统映射表
    for (const [hardcodedAppName, hardcodedPackageName] of Object.entries(HARDCODED_APP_MAPPING)) {
      // 跳过硬编码映射表中应用名和包名相同的条目
      if (hardcodedAppName === hardcodedPackageName || hardcodedAppName.trim() === hardcodedPackageName.trim()) {
        continue;
      }
      
      // 在系统映射表中查找是否有相同的包名
      let foundSystemEntry: { appName: string; packageName: string } | null = null;
      for (const [systemAppName, systemPackageName] of Object.entries(systemMapping)) {
        if (systemPackageName === hardcodedPackageName) {
          foundSystemEntry = { appName: systemAppName, packageName: systemPackageName };
          break;
        }
      }
      
      if (foundSystemEntry) {
        matchedPackageNames.add(hardcodedPackageName);
        
        // 情况1: 系统侧应用名称和包名一致，则用硬编码的应用名称替换掉
        if (foundSystemEntry.appName === foundSystemEntry.packageName || 
            foundSystemEntry.appName.trim() === foundSystemEntry.packageName.trim()) {
          // 删除系统映射表中的旧条目
          delete merged[foundSystemEntry.appName];
          // 添加硬编码映射表的条目
          merged[hardcodedAppName] = hardcodedPackageName;
          replacedCount++;
          // console.info(`[应用映射服务] 替换系统映射表条目: "${foundSystemEntry.appName}" -> "${hardcodedAppName}" (包名: ${hardcodedPackageName})`);
        } else {
          // 情况2: 系统侧应用名称和包名不一致，则检查系统侧应用名和硬编码应用名是否一致
          if (foundSystemEntry.appName === hardcodedAppName || 
              foundSystemEntry.appName.trim() === hardcodedAppName.trim()) {
            // 一致则跳过
            skippedCount++;
            // console.info(`[应用映射服务] 跳过硬编码条目（系统映射表已有相同的应用名）: "${hardcodedAppName}" (包名: ${hardcodedPackageName})`);
          } else {
            // 不一致则添加进去（硬编码的应用名作为新的key）
            merged[hardcodedAppName] = hardcodedPackageName;
            addedCount++;
            // console.info(`[应用映射服务] 添加硬编码条目（系统映射表应用名不同）: "${hardcodedAppName}" (包名: ${hardcodedPackageName})`);
          }
        }
      }
    }
    
    // 步骤2: 将那些没有匹配成功的且包名和应用名一致的剔除
    let removedCount = 0;
    const finalMerged: AppMapping = {};
    for (const [appName, packageName] of Object.entries(merged)) {
      // 如果应用名和包名一致，且这个包名没有在硬编码映射表中匹配成功，则剔除
      const isAppNameEqualsPackageName = appName === packageName || appName.trim() === packageName.trim();
      if (isAppNameEqualsPackageName && !matchedPackageNames.has(packageName)) {
        removedCount++;
        continue;
      }
      finalMerged[appName] = packageName;
    }
    
    if (replacedCount > 0) {
      console.info(`[应用映射服务] 从硬编码映射表替换了 ${replacedCount} 个系统映射表条目`);
    }
    if (addedCount > 0) {
      console.info(`[应用映射服务] 从硬编码映射表添加了 ${addedCount} 个新条目`);
    }
    if (skippedCount > 0) {
      console.info(`[应用映射服务] 跳过了 ${skippedCount} 个硬编码条目（系统映射表已有相同的应用名）`);
    }
    if (removedCount > 0) {
      console.info(`[应用映射服务] 移除了 ${removedCount} 个未匹配且应用名和包名一致的条目`);
    }
    
    return finalMerged;
  }

  /**
   * 获取应用映射表（带缓存）
   * 如果缓存存在且未过期，直接返回缓存
   * 否则从原生模块获取并更新缓存
   */
  async getAppMapping(forceRefresh: boolean = false): Promise<AppMapping> {
    // 如果内存中有缓存且不强制刷新，直接返回（确保已清理）
    if (!forceRefresh && this.cachedMapping) {
      // 对内存缓存也进行清理，确保没有应用名和包名相同的条目
      const cleaned = this.cleanMapping(this.cachedMapping);
      if (Object.keys(cleaned).length !== Object.keys(this.cachedMapping).length) {
        // 如果清理后数量有变化，更新内存缓存
        this.cachedMapping = cleaned;
      }
      return cleaned;
    }

    // 尝试从持久化缓存加载
    if (!forceRefresh) {
      const cached = await this.loadFromCache();
      if (cached) {
        // 对缓存的映射表也进行清理，确保没有应用名和包名相同的条目
        const cleanedCached = this.cleanMapping(cached);
        this.cachedMapping = cleanedCached;
        return cleanedCached;
      }
    }

    // 从原生模块获取
    console.info('[应用映射服务] 从原生模块获取应用列表...');
    let mapping = await this.fetchAllInstalledApps();
    
    // 步骤1: 清理映射表，去除应用名和包名重复的条目
    mapping = this.cleanMapping(mapping);

    // 步骤2: 融合硬编码映射表（以系统映射表为准）
    mapping = this.mergeHardcodedMapping(mapping);

    // 步骤3: 再次清理映射表，确保融合后没有应用名和包名相同的条目
    mapping = this.cleanMapping(mapping);

    // 保存到缓存
    await this.saveToCache(mapping);

    return mapping;
  }

  /**
   * 在指定映射表中查找包名（精确匹配和模糊匹配）
   * @param appName 应用名称
   * @param mapping 映射表
   * @returns 包名，如果未找到则返回 null
   */
  private findInMapping(appName: string, mapping: AppMapping): string | null {
    // 精确匹配
    if (mapping[appName]) {
      return mapping[appName];
    }

    // 模糊匹配（包含关系）
    const lowerAppName = appName.toLowerCase();
    for (const [name, packageName] of Object.entries(mapping)) {
      if (name.toLowerCase().includes(lowerAppName) || lowerAppName.includes(name.toLowerCase())) {
        return packageName;
      }
    }

    return null;
  }

  /**
   * 根据应用名称查找包名
   * @param appName 应用名称（如：微信、浏览器等）
   * @returns 包名，如果未找到则返回 null
   */
  async findPackageName(appName: string): Promise<string | null> {
    // 先尝试从动态映射表查找
    try {
      const mapping = await this.getAppMapping();
      const packageName = this.findInMapping(appName, mapping);
      if (packageName) {
        return packageName;
      }
    } catch (error) {
      // 如果获取动态映射表失败，继续尝试硬编码映射表
      console.warn('[应用映射服务] 获取动态映射表失败，使用硬编码映射表:', error);
    }

    // 如果动态映射表中找不到，使用硬编码映射表作为兜底
    const hardcodedPackageName = this.findInMapping(appName, HARDCODED_APP_MAPPING);
    if (hardcodedPackageName) {
      console.info(`[应用映射服务] 从硬编码映射表找到包名: "${appName}" -> "${hardcodedPackageName}"`);
      return hardcodedPackageName;
    }

    return null;
  }

  /**
   * 清除缓存
   */
  async clearCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(APP_MAPPING_CACHE_KEY),
        AsyncStorage.removeItem(APP_MAPPING_CACHE_TIMESTAMP_KEY),
      ]);
      this.cachedMapping = null;
      this.cacheTimestamp = null;
      console.info('[应用映射服务] 缓存已清除');
    } catch (error) {
      console.error('[应用映射服务] 清除缓存失败:', error);
    }
  }

  /**
   * 初始化应用映射表（如果 ADB 启用）
   * 在任务执行前调用此方法
   */
  async initializeIfNeeded(adbFallbackEnabled: boolean): Promise<void> {
    if (!adbFallbackEnabled) {
      console.info('[应用映射服务] ADB 未启用，跳过应用映射表初始化');
      return;
    }

    try {
      console.info('[应用映射服务] ADB 已启用，开始初始化应用映射表...');
      await this.getAppMapping();
      console.info('[应用映射服务] 应用映射表初始化完成');
    } catch (error) {
      console.error('[应用映射服务] 初始化应用映射表失败:', error);
      // 不抛出错误，允许任务继续执行
    }
  }
}

export const appMappingService = new AppMappingService();

