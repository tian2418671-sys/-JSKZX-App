package com.sillytavern.cardmanager.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * 后台保活前台服务（Bug 反馈#2：切后台即被杀）
 *  - 以「前台服务 + 常驻通知」持有进程优先级，后台切换后 WebView 不再被系统回收
 *  - 持有 PARTIAL_WAKE_LOCK：后台期间 CPU 不休眠，测卡会话/解析状态不被冻结
 *  - START_STICKY：进程被系统回收后由系统重建并恢复服务
 *  - 前台服务类型 dataSync（API 34+ 要求声明 FGS 类型 + 对应权限）
 */
public class KeepAliveService extends Service {

    private static final String CHANNEL_ID = "jsx_keepalive";
    private static final int NOTIFY_ID = 1001;
    private static final String LOCK_TAG = "jsx:keepalive";

    /** 保活运行状态(供 KeepAlivePlugin.isRunning 查询,服务进程内静态标记) */
    private static volatile boolean running = false;

    public static boolean isRunning() {
        return running;
    }

    /** onCreate 中 startForeground 是否成功;失败时服务已 stopSelf,onStartCommand 不得复位状态 */
    private volatile boolean foregroundStarted = false;

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        // 🐛 防御:START_STICKY 由系统在**应用可能处于后台**时重建服务,此时直接调
        // startForeground 会抛 ForegroundServiceStartNotAllowedException(Android 12+)
        // 导致崩溃;失败则停止自身,等应用回前台后由设置页/启动逻辑重新拉起。
        try {
            startForeground(NOTIFY_ID, buildNotification());
            foregroundStarted = true;
            running = true;
        } catch (Throwable t) {
            foregroundStarted = false;
            running = false;
            stopSelf();
            return;
        }
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 🐛 时序修复:onCreate 在 onStartCommand 之前执行;若 onCreate 阶段
        // startForeground 失败已 stopSelf,running 已置 false,此时不能再复位为 true
        // (否则设置页 isRunning 误报"运行中",且 START_STICKY 可能反复拉起)。
        if (!foregroundStarted) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // START_STICKY:进程被系统杀死后重建时自动恢复(带 null intent)
        running = true;
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // 纯 startService 场景,无需绑定
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, LOCK_TAG);
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        } catch (Exception e) {
            wakeLock = null; // 个别厂商限制 WakeLock 获取,保活降级为前台服务本身
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignore) { /* 忽略 */ }
        }
        wakeLock = null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "后台保活", NotificationManager.IMPORTANCE_MIN);
        ch.setShowBadge(false);
        ch.setSound(null, null);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        // 点击通知回到应用主界面
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_popup_sync) // 系统单色图标,适配通知栏标准(彩色自适应图标在状态栏会显示为白色方块)
                .setContentTitle("JSKZX 正在后台运行")
                .setContentText("返回应用继续编辑与测卡")
                .setOngoing(true)
                .setShowWhen(false)
                .setContentIntent(pi);
        return b.build();
    }
}
