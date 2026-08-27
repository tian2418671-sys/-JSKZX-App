package com.sillytavern.cardmanager.android;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Android Keystore 安全存储
 * 使用 Android Keystore 系统(AES-256-GCM)加密 API Key 等敏感数据。
 * 密钥由 TEE/StrongBox 硬件保护,私钥永不离片。
 *
 * 与桌面 Electron safeStorage 语义对齐:
 *   - encryptSecret(plain) → {success:true, value:base64(iv+ciphertext)}
 *   - decryptSecret(cipher) → {success:true, value:plaintext}
 */
@CapacitorPlugin(name = "KeystorePlugin")
public class KeystorePlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "jszkx_api_key";
    private static final String AES_GCM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128; // bits
    private static final int GCM_IV_LENGTH = 12;    // bytes (96-bit recommended for GCM)

    // region 密钥管理

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }
        // 生成新密钥 (AES-256-GCM, TEE/StrongBox 优先)
        KeyGenerator kg = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(false) // 我们自行管理 IV
                .build();
        kg.init(spec);
        return kg.generateKey();
    }

    // endregion

    @PluginMethod()
    public void encrypt(PluginCall call) {
        try {
            String plain = call.getString("plain");
            if (plain == null || plain.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("value", ""); // 空串照传,不加密
                call.resolve(ret);
                return;
            }

            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance(AES_GCM);
            cipher.init(Cipher.ENCRYPT_MODE, key);

            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(plain.getBytes("UTF-8"));

            // 打包: IV(12) + Ciphertext(含 GCM tag)
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

            String value = Base64.encodeToString(combined, Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("value", value);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod()
    public void decrypt(PluginCall call) {
        try {
            String cipherText = call.getString("cipher");
            if (cipherText == null || cipherText.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("value", ""); // 空串照传
                call.resolve(ret);
                return;
            }

            byte[] combined = Base64.decode(cipherText, Base64.NO_WRAP);
            if (combined.length < GCM_IV_LENGTH + 1) {
                // 可能是旧版明文(向后兼容):直接返回原值
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "密文格式无效(可能为旧版明文)");
                call.resolve(ret);
                return;
            }

            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.length);

            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance(AES_GCM);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, key, spec);

            byte[] plainBytes = cipher.doFinal(ciphertext);
            String value = new String(plainBytes, "UTF-8");

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("value", value);
            call.resolve(ret);
        } catch (Exception e) {
            // 解密失败:可能是旧版明文,返回失败让调用方回退明文
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }
}