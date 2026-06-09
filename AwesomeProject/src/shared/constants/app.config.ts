/**
 * 应用配置
 * 所有应用功能相关的常量配置（ADB、无障碍、AutoGLM等）
 */

// ADB服务配置
// 参考：https://github.com/zai-org/Open-AutoGLM/blob/main/phone_agent/config/apps.py
export const ADB_CONFIG = {
  // 常见应用名称到包名的映射
  COMMON_APP_PACKAGES: {
    // 社交和消息
    '微信': 'com.tencent.mm',
    'WeChat': 'com.tencent.mm',
    'wechat': 'com.tencent.mm',
    'QQ': 'com.tencent.mobileqq',
    'qq': 'com.tencent.mobileqq',
    '微博': 'com.sina.weibo',
    'weibo': 'com.sina.weibo',
    'Telegram': 'org.telegram.messenger',
    'telegram': 'org.telegram.messenger',
    'WhatsApp': 'com.whatsapp',
    'Whatsapp': 'com.whatsapp',
    'whatsapp': 'com.whatsapp',
    'Twitter': 'com.twitter.android',
    'twitter': 'com.twitter.android',
    'X': 'com.twitter.android',
    'Reddit': 'com.reddit.frontpage',
    'reddit': 'com.reddit.frontpage',
    
    // 电商
    '淘宝': 'com.taobao.taobao',
    'taobao': 'com.taobao.taobao',
    '淘宝闪购': 'com.taobao.taobao',
    '京东': 'com.jingdong.app.mall',
    '京东秒送': 'com.jingdong.app.mall',
    '拼多多': 'com.xunmeng.pinduoduo',
    'Temu': 'com.einnovation.temu',
    'temu': 'com.einnovation.temu',
    
    // 生活方式和社交
    '小红书': 'com.xingin.xhs',
    'xhs': 'com.xingin.xhs',
    '豆瓣': 'com.douban.frodo',
    '知乎': 'com.zhihu.android',
    'Quora': 'com.quora.android',
    'quora': 'com.quora.android',
    
    // 地图和导航
    '高德地图': 'com.autonavi.minimap',
    '百度地图': 'com.baidu.BaiduMap',
    'Google Maps': 'com.google.android.apps.maps',
    'GoogleMaps': 'com.google.android.apps.maps',
    'googlemaps': 'com.google.android.apps.maps',
    'google maps': 'com.google.android.apps.maps',
    'Osmand': 'net.osmand',
    'osmand': 'net.osmand',
    
    // 食品和服务
    '美团': 'com.sankuai.meituan',
    'meituan': 'com.sankuai.meituan',
    '大众点评': 'com.dianping.v1',
    '饿了么': 'me.ele',
    'eleme': 'me.ele',
    '肯德基': 'com.yek.android.kfc.activitys',
    'McDonald': 'com.mcdonalds.app',
    'mcdonald': 'com.mcdonalds.app',
    
    // 旅行
    '携程': 'ctrip.android.view',
    '铁路12306': 'com.MobileTicket',
    '12306': 'com.MobileTicket',
    '去哪儿': 'com.Qunar',
    '去哪儿旅行': 'com.Qunar',
    '滴滴出行': 'com.sdu.didi.psnger',
    'Booking.com': 'com.booking',
    'Booking': 'com.booking',
    'booking.com': 'com.booking',
    'booking': 'com.booking',
    'BOOKING.COM': 'com.booking',
    'Expedia': 'com.expedia.bookings',
    'expedia': 'com.expedia.bookings',
    
    // 视频和娱乐
    'bilibili': 'tv.danmaku.bili',
    '抖音': 'com.ss.android.ugc.aweme',
    'douyin': 'com.ss.android.ugc.aweme',
    '快手': 'com.smile.gifmaker',
    '腾讯视频': 'com.tencent.qqlive',
    '爱奇艺': 'com.qiyi.video',
    '优酷视频': 'com.youku.phone',
    '芒果TV': 'com.hunantv.imgo.activity',
    '红果短剧': 'com.phoenix.read',
    'Tiktok': 'com.zhiliaoapp.musically',
    'tiktok': 'com.zhiliaoapp.musically',
    'VLC': 'org.videolan.vlc',
    
    // 音乐和音频
    '网易云音乐': 'com.netease.cloudmusic',
    'QQ音乐': 'com.tencent.qqmusic',
    '汽水音乐': 'com.luna.music',
    '喜马拉雅': 'com.ximalaya.ting.android',
    'PiMusicPlayer': 'com.Project100Pi.themusicplayer',
    'pimusicplayer': 'com.Project100Pi.themusicplayer',
    'RetroMusic': 'code.name.monkey.retromusic',
    'retromusic': 'code.name.monkey.retromusic',
    
    // 阅读
    '番茄小说': 'com.dragon.read',
    '番茄免费小说': 'com.dragon.read',
    '七猫免费小说': 'com.kmxs.reader',
    'Google Play Books': 'com.google.android.apps.books',
    'Google-Play-Books': 'com.google.android.apps.books',
    'google play books': 'com.google.android.apps.books',
    'google-play-books': 'com.google.android.apps.books',
    'GooglePlayBooks': 'com.google.android.apps.books',
    'googleplaybooks': 'com.google.android.apps.books',
    
    // 生产力
    '飞书': 'com.ss.android.lark',
    'QQ邮箱': 'com.tencent.androidqqmail',
    'Gmail': 'com.google.android.gm',
    'gmail': 'com.google.android.gm',
    'GoogleMail': 'com.google.android.gm',
    'Google Mail': 'com.google.android.gm',
    'Google Calendar': 'com.google.android.calendar',
    'GoogleCalendar': 'com.google.android.calendar',
    'Google-Calendar': 'com.google.android.calendar',
    'google-calendar': 'com.google.android.calendar',
    'google calendar': 'com.google.android.calendar',
    'Google Docs': 'com.google.android.apps.docs.editors.docs',
    'GoogleDocs': 'com.google.android.apps.docs.editors.docs',
    'googledocs': 'com.google.android.apps.docs.editors.docs',
    'google docs': 'com.google.android.apps.docs.editors.docs',
    'Google Drive': 'com.google.android.apps.docs',
    'Google-Drive': 'com.google.android.apps.docs',
    'google drive': 'com.google.android.apps.docs',
    'google-drive': 'com.google.android.apps.docs',
    'GoogleDrive': 'com.google.android.apps.docs',
    'Googledrive': 'com.google.android.apps.docs',
    'googledrive': 'com.google.android.apps.docs',
    'Google Slides': 'com.google.android.apps.docs.editors.slides',
    'GoogleSlides': 'com.google.android.apps.docs.editors.slides',
    'Google-Slides': 'com.google.android.apps.docs.editors.slides',
    'Google Tasks': 'com.google.android.apps.tasks',
    'GoogleTasks': 'com.google.android.apps.tasks',
    'Google-Tasks': 'com.google.android.apps.tasks',
    'Google Keep': 'com.google.android.keep',
    'GoogleKeep': 'com.google.android.keep',
    'googlekeep': 'com.google.android.keep',
    'Google Chat': 'com.google.android.apps.dynamite',
    'GoogleChat': 'com.google.android.apps.dynamite',
    'Google-Chat': 'com.google.android.apps.dynamite',
    'Joplin': 'net.cozic.joplin',
    'joplin': 'net.cozic.joplin',
    
    // AI和工具
    '豆包': 'com.larus.nova',
    
    // 健康和健身
    'keep': 'com.gotokeep.keep',
    'Keep': 'com.gotokeep.keep',
    '美柚': 'com.lingan.seeyou',
    'Google Fit': 'com.google.android.apps.fitness',
    'GoogleFit': 'com.google.android.apps.fitness',
    'googlefit': 'com.google.android.apps.fitness',
    
    // 新闻和信息
    '腾讯新闻': 'com.tencent.news',
    '今日头条': 'com.ss.android.article.news',
    
    // 房地产
    '贝壳找房': 'com.lianjia.beike',
    '安居客': 'com.anjuke.android.app',
    
    // 金融
    '同花顺': 'com.hexin.plat.android',
    '支付宝': 'com.eg.android.AlipayGphone',
    'alipay': 'com.eg.android.AlipayGphone',
    
    // 游戏
    '星穹铁道': 'com.miHoYo.hkrpg',
    '崩坏：星穹铁道': 'com.miHoYo.hkrpg',
    '恋与深空': 'com.papegames.lysk.cn',
    
    // 系统应用
    '设置': 'com.android.settings',
    'Settings': 'com.android.settings',
    'settings': 'com.android.settings',
    'AndroidSystemSettings': 'com.android.settings',
    'Android System Settings': 'com.android.settings',
    'Android  System Settings': 'com.android.settings',
    'Android-System-Settings': 'com.android.settings',
    '录音机': 'com.android.soundrecorder',
    'AudioRecorder': 'com.android.soundrecorder',
    'audiorecorder': 'com.android.soundrecorder',
    '时钟': 'com.android.deskclock',
    'Clock': 'com.android.deskclock',
    'clock': 'com.android.deskclock',
    'Google Clock': 'com.google.android.deskclock',
    'GoogleClock': 'com.google.android.deskclock',
    'Google-Clock': 'com.google.android.deskclock',
    '联系人': 'com.android.contacts',
    'Contacts': 'com.android.contacts',
    'contacts': 'com.android.contacts',
    'Google Contacts': 'com.google.android.contacts',
    'GoogleContacts': 'com.google.android.contacts',
    'Google-Contacts': 'com.google.android.contacts',
    'google-contacts': 'com.google.android.contacts',
    'google contacts': 'com.google.android.contacts',
    '文件管理': 'com.android.fileexplorer',
    'Files': 'com.android.fileexplorer',
    'files': 'com.android.fileexplorer',
    'File Manager': 'com.android.fileexplorer',
    'file manager': 'com.android.fileexplorer',
    'Google Files': 'com.google.android.apps.nbu.files',
    'GoogleFiles': 'com.google.android.apps.nbu.files',
    'googlefiles': 'com.google.android.apps.nbu.files',
    'FilesbyGoogle': 'com.google.android.apps.nbu.files',
    'Google Play Store': 'com.android.vending',
    'GooglePlayStore': 'com.android.vending',
    'Google-Play-Store': 'com.android.vending',
    
    // 浏览器
    '浏览器': 'com.android.browser',
    'browser': 'com.android.browser',
    'Chrome': 'com.android.chrome',
    'chrome': 'com.android.chrome',
    'Google Chrome': 'com.android.chrome',
    
    // 其他应用
    'Bluecoins': 'com.rammigsoftware.bluecoins',
    'bluecoins': 'com.rammigsoftware.bluecoins',
    'Broccoli': 'com.flauschcode.broccoli',
    'broccoli': 'com.flauschcode.broccoli',
    'Duolingo': 'com.duolingo',
    'duolingo': 'com.duolingo',
    'SimpleCalendarPro': 'com.scientificcalculatorplus.simplecalculator.basiccalculator.mathcalc',
    'SimpleSMSMessenger': 'com.simplemobiletools.smsmessenger',
    "WPS": "cn.wps.moffice_eng",
    "wps": "cn.wps.moffice_eng",
    "WPS Office": "cn.wps.moffice_eng",
  } as const,
} as const;

/**
 * 获取浏览器类应用的包名列表（从映射中动态获取）
 * @returns 浏览器包名数组
 */
export function getBrowserPackages(): readonly string[] {
  // 从映射中提取浏览器相关的包名
  const browserPackages = new Set<string>();
  
  // 遍历映射，找出浏览器相关的应用
  for (const [appName, packageName] of Object.entries(ADB_CONFIG.COMMON_APP_PACKAGES)) {
    const lowerName = appName.toLowerCase();
    if (
      lowerName.includes('browser') ||
      lowerName.includes('chrome') ||
      lowerName.includes('浏览器') ||
      lowerName === '浏览器'
    ) {
      browserPackages.add(packageName);
    }
  }
  
  // 添加额外的常见浏览器包名（可能不在映射中）
  const additionalBrowsers = [
    'com.UCMobile',
    'com.tencent.mtt',
    'com.baidu.searchbox',
    'com.qihoo.browser',
    'com.opera.browser',
    'org.mozilla.firefox',
  ];
  
  additionalBrowsers.forEach(pkg => browserPackages.add(pkg));
  
  return Array.from(browserPackages);
}

// 无障碍服务配置
export const ACCESSIBILITY_CONFIG = {
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  
  /** 重试延迟时间（毫秒） */
  RETRY_DELAY_MS: 500,
  
  /** 服务启动超时时间（毫秒） */
  SERVICE_STARTUP_TIMEOUT_MS: 5000,
  
  /** Android 9检查重试次数 */
  ANDROID_9_CHECK_RETRIES: 10,
  
  /** Android 9检查延迟时间（毫秒） */
  ANDROID_9_CHECK_DELAY_MS: 500,
} as const;

// AutoGLM 服务配置
import { API_REQUEST_CONFIG } from './api.config';

export const AUTOGLM_CONFIG = {
  // 默认屏幕分辨率（如果无法获取实际分辨率时使用）
  DEFAULT_SCREEN_SIZE: {
    width: 1080,
    height: 1920,
  } as const,

  // 对话历史配置（参考 agent.py：保留完整历史，不限制长度）
  // 注意：agent.py 中不限制对话历史长度，保留完整的 _context
  CONVERSATION_HISTORY: {
    // 不再限制对话历史长度，保留完整历史以维护上下文
  } as const,

  // API请求配置（兼容旧代码，实际使用 API_REQUEST_CONFIG）
  API_REQUEST: API_REQUEST_CONFIG,
} as const;

