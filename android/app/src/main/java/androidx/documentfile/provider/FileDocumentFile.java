package androidx.documentfile.provider;

import android.net.Uri;
import android.webkit.MimeTypeMap;

import java.io.File;

/**
 * JSKZX 移动端 P1「全盘模式」的路径后端适配层。
 *
 * 背景：本项目的库读写全部建立在 androidx {@link DocumentFile} 之上（43 处调用点）。
 * 当 SAF 在部分 ROM 上整体不可用（选择器进不去 / DocumentsProvider 不返回子项）时，
 * 需要一条「按真实路径直接访问」的兜底通道。把 {@link File} 包装成 DocumentFile，
 * 即可让上层逻辑零改动复用。
 *
 * 说明：{@code DocumentFile(DocumentFile)} 构造器是包级私有，因此本类必须声明在
 * {@code androidx.documentfile.provider} 包内（同包即可访问，无需反射）。
 *
 * URI 语义：使用 {@code file:} scheme；读写流必须经 LibraryFsPlugin 的 openIn/openOut 分派，
 * 不要直接交给 ContentResolver（{@code content://} 才适用于 SAF）。
 */
public class FileDocumentFile extends DocumentFile {

    private final File file;

    public FileDocumentFile(File file, DocumentFile parent) {
        super(parent);
        this.file = file;
    }

    /** 供调用方取回底层 File（SAF 后端下不适用） */
    public File getFile() {
        return file;
    }

    @Override
    public DocumentFile createFile(String mimeType, String displayName) {
        File f = new File(file, displayName);
        try {
            if (f.exists() || f.createNewFile()) return new FileDocumentFile(f, this);
        } catch (Exception ignored) {
            // 创建失败与 SAF 语义一致：返回 null 由调用方判定
        }
        return null;
    }

    @Override
    public DocumentFile createDirectory(String displayName) {
        File f = new File(file, displayName);
        if (f.isDirectory() || f.mkdirs()) return new FileDocumentFile(f, this);
        return null;
    }

    @Override
    public Uri getUri() {
        return Uri.fromFile(file);
    }

    @Override
    public String getName() {
        return file.getName();
    }

    @Override
    public String getType() {
        String name = file.getName();
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            String ext = name.substring(dot + 1).toLowerCase();
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (mime != null) return mime;
        }
        return file.isDirectory() ? "vnd.android.document/directory" : "application/octet-stream";
    }

    @Override
    public boolean isDirectory() {
        return file.isDirectory();
    }

    @Override
    public boolean isFile() {
        return file.isFile();
    }

    @Override
    public boolean isVirtual() {
        return false;
    }

    @Override
    public boolean delete() {
        return deleteRecursively(file);
    }

    @Override
    public boolean exists() {
        return file.exists();
    }

    @Override
    public boolean canRead() {
        return file.canRead();
    }

    @Override
    public boolean canWrite() {
        return file.canWrite();
    }

    @Override
    public long lastModified() {
        return file.lastModified();
    }

    @Override
    public long length() {
        return file.isFile() ? file.length() : 0L;
    }

    @Override
    public boolean renameTo(String displayName) {
        File parent = file.getParentFile();
        if (parent == null) return false;
        return file.renameTo(new File(parent, displayName));
    }

    @Override
    public DocumentFile[] listFiles() {
        File[] children = file.listFiles();
        if (children == null) return new DocumentFile[0];
        DocumentFile[] out = new DocumentFile[children.length];
        for (int i = 0; i < children.length; i++) out[i] = new FileDocumentFile(children[i], this);
        return out;
    }

    @Override
    public DocumentFile getParentFile() {
        File parent = file.getParentFile();
        return parent == null ? null : new FileDocumentFile(parent, null);
    }

    @Override
    public DocumentFile findFile(String displayName) {
        File f = new File(file, displayName);
        return f.exists() ? new FileDocumentFile(f, this) : null;
    }

    private static boolean deleteRecursively(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        return f.delete();
    }
}
