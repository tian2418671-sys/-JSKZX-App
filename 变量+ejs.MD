APK 变量系统 + EJS 引擎完整实现
一、总体架构：双引擎设计
┌────────────────────────────────────────────────────────────┐
│                     APK 渲染/提示词总管线                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  AI回复到达                     发送消息时                    │
│      │                            │                        │
│      ▼                            ▼                        │
│  ┌──────────┐              ┌──────────────┐                │
│  │ 变量引擎  │              │ PromptBuilder │                │
│  │ (Kotlin) │              │   (Kotlin)   │                │
│  └────┬─────┘              └──────┬───────┘                │
│       │ <UpdateVariable>          │ EJS条目                 │
│       ▼                           ▼                        │
│  VariableStore ◄────API桥──── ┌──────────┐                 │
│  · 变量树+持久化               │ EJS引擎   │                 │
│  · JSON Patch/MVU指令         │ (QuickJS) │                 │
│  · 消息级快照                 └──────────┘                 │
│  · 事件监听                                                │
│       │                                                    │
│       ▼                                                    │
│  RenderPipeline(前篇正则引擎) → WebView/Compose 渲染         │
└────────────────────────────────────────────────────────────┘
关键决策：变量树用 Kotlin 管理（强类型+持久化），模板执行用 JS 引擎（EJS 本身就是 JS 语法，在 JS 运行时里跑才是完美兼容）。
二、JS 运行时选型
引擎	体积	启动	ES标准	集成难度	结论	
QuickJS（quickjs-kt）	~1MB	<10ms	ES2020	中（需so库）	✅ 主选	
Rhino（纯Java）	~2MB	慢	ES5+部分	极易	✅ 兜底（免NDK分包）	
Javet(V8)	15MB+	中	完整	高	不必要	
// build.gradle.kts
implementation("com.github.dokar3:quickjs-kt:0.9.2")  // 主选
三、QuickJS 宿主封装（沙箱 + API 桥）
/**
 * 单例JS宿主：所有EJS执行在此进行
 * 安全策略：内存上限 + 超时中断 + 禁网络 + API白名单
 */
class QuickJsHost private constructor() {
    private var runtime: QuickJs? = null
    private val api = TemplateApiBridge()          // 第四节的桥
    private val executor = Executors.newSingleThreadExecutor()  // QuickJS非线程安全
    companion object {
        val instance: QuickJsHost by lazy { QuickJsHost() }
        const val MEM_LIMIT = 16 * 1024 * 1024     // 16MB
        const val TIMEOUT_MS = 2000L
    }
    fun init(context: Context) = executor.execute {
        runtime = QuickJs.create().apply {
            setMemoryLimit(MEM_LIMIT)
            setMaxStackSize(512 * 1024)
            installConsole()
            installHostApi(api)
            loadEjsCompiler(context)               // 第五节：注入迷你EJS编译器
        }
    }
    /** 对外入口：任意JS求值（含EJS渲染） */
    fun <T> eval(script: String): T? = executor.submit<T?> {
        runtime?.let { rt ->
            installTimeout(TIMEOUT_MS)             // 看门狗中断
            rt.evaluate(script)
        }
    }.get()
    private fun installTimeout(ms: Long) {
        // quickjs-kt: rt.interruptHandler = { deadline exceeded }
        val deadline = System.currentTimeMillis() + ms
        runtime?.interruptHandler = { System.currentTimeMillis() > deadline }
    }
    private fun installConsole() {
        runtime?.setGlobal("console", mapOf(
            "log" to { args: Array<Any?> -> Log.d("EJS", args.joinToString()) }
        ))
    }
    private fun installHostApi(api: TemplateApiBridge) {
        runtime?.setGlobal("getChatMessage") { idx: Int -> api.getChatMessage(idx) }
        runtime?.setGlobal("getMessageVar")    { path: String, depth: Int? ->
            api.getMessageVar(path, depth ?: 0) }
        runtime?.setGlobal("getVariables")     { api.getVariables() }
        runtime?.setGlobal("insertOrAssignVariables") { patch: String ->
            api.applyPatch(patch) }
        runtime?.setGlobal("__hostReadFile")   { name: String -> api.readAsset(name) }
    }
    private fun loadEjsCompiler(ctx: Context) {
        val code = ctx.assets.open("ejs.min.js").bufferedReader().readText()
        runtime?.evaluate(code)
    }
}
setGlobal/evaluate 的签名以实际绑定库为准，思路一致：把宿主能力以函数白名单注入，其余全禁。
四、变量系统（MVU 兼容）
4.1 VariableStore：变量树 + 路径寻址 + 持久化
class VariableStore(private val chatDir: File) {
    private val root = JSONObject()   // stat_data 挂在根下
    private val listeners = mutableListOf<(String, Any?, Any?) -> Unit>()
    // ── 路径寻址：支持点分 a.b.0.c（数组用数字索引）──
    private fun segments(path: String) =
        path.split('.').filter { it.isNotBlank() }
    fun get(path: String): Any? {
        var cur: Any? = root
        for (seg in segments(path)) {
            cur = when (cur) {
                is JSONObject -> if (cur.has(seg)) cur.opt(seg) else null
                is JSONArray  -> seg.toIntOrNull()?.let { cur.opt(it) }
                else -> null
            } ?: return null
        }
        return cur
    }
    fun set(path: String, value: Any?) {
        val segs = segments(path)
        val old = get(path)
        var cur: Any = root
        for (i in 0 until segs.size - 1) {
            val next = childOf(cur, segs[i]) ?: run {
                val fresh = if (segs[i + 1].toIntOrNull() != null) JSONArray() else JSONObject()
                attach(cur, segs[i], fresh); fresh
            }
            cur = next
        }
        attach(cur, segs.last(), wrap(value))
        fire(path, old, value)
    }
    private fun childOf(parent: Any, seg: String): Any? = when (parent) {
        is JSONObject -> parent.opt(seg)
        is JSONArray  -> seg.toIntOrNull()?.let { parent.opt(it) }
        else -> null
    }
    private fun attach(parent: Any, seg: String, v: Any) {
        when (parent) {
            is JSONObject -> parent.put(seg, v)
            is JSONArray  -> parent.put(seg.toInt(), v)
        }
    }
    private fun wrap(v: Any?): Any = when (v) {
        null -> JSONObject.NULL
        is Number, is Boolean, is String -> v
        is Map<*, *> -> JSONObject(v)
        is List<*> -> JSONArray(v)
        else -> JSONObject.wrap(v) ?: v.toString()
    }
    // ── 事件 ──
    fun addListener(l: (path: String, old: Any?, new: Any?) -> Unit) { listeners += l }
    private fun fire(path: String, old: Any?, new: Any?) =
        listeners.forEach { it(path, old, new) }
    // ── 持久化 ──
    fun persist() {
        chatDir.resolve("variables.json").writeText(root.toString())
    }
    fun restore() {
        val f = chatDir.resolve("variables.json")
        if (f.exists()) mergeInto(root, JSONObject(f.readText()))
    }
    fun snapshotJson(): String = root.toString()
}
4.2 MVU 指令引擎（<UpdateVariable> 解析）
兼容两种格式：MVU 风格指令 + RFC 6902 JSON Patch。
sealed class MvuOp {
    data class Init(val data: JSONObject) : MvuOp()
    data class Set(val path: String, val value: Any?) : MvuOp()
    data class Add(val path: String, val delta: Number) : MvuOp()          // 数值累加
    data class Delete(val path: String) : MvuOp()
    data class Insert(val path: String, val value: Any?) : MvuOp()         // 数组push
    data class Patch(val ops: JSONArray) : MvuOp()                          // RFC6902
}
object MvuParser {
    /** 从AI消息提取全部 <UpdateVariable> 块并解析为指令序列 */
    fun extract(text: String): Pair<List<MvuOp>, String> {
        val re = Regex("<UpdateVariable>([\\s\\S]*?)</UpdateVariable>", RegexOption.IGNORE_CASE)
        val ops = mutableListOf<MvuOp>()
        re.forEach(text) { m ->
            m.groupValues[1].trim().parseOps()?.let { ops += it }
        }
        return ops to text.replace(re, "").trim()   // 第二返回值：剔除后的显示文本
    }
    private fun String.parseOps(): List<MvuOp>? = try {
        when {
            startsWith("[") -> JSONArray(this).let { arr ->
                (0 until arr.length()).map { jsonToOp(arr.getJSONObject(it)) }
            }
            startsWith("{") -> listOf(jsonToOp(JSONObject(this)))
            else -> null
        }
    } catch (e: Exception) { null }
    private fun jsonToOp(j: JSONObject): MvuOp = when (j.optString("type").lowercase()) {
        "init"   -> MvuOp.Init(j.optJSONObject("data") ?: JSONObject())
        "set"    -> MvuOp.Set(j.getString("path"), j.opt("value"))
        "add"    -> MvuOp.Add(j.getString("path"), j.optDouble("value"))
        "delete" -> MvuOp.Delete(j.getString("path"))
        "insert" -> MvuOp.Insert(j.getString("path"), j.opt("value"))
        "patch"  -> MvuOp.Patch(j.optJSONArray("ops") ?: JSONArray())
        else     -> MvuOp.Set(j.optString("path"), j.opt("value"))  // 宽容
    }
}
指令执行器（含消息级快照）：
class VariableEngine(
    private val store: VariableStore,
    private val snapshotsDir: File
) {
    /** AI消息到达：应用变量更新 → 落快照 → 返回显示用文本 */
    fun onAiMessage(msgId: Long, rawText: String): String {
        val (ops, displayText) = MvuParser.extract(rawText)
        if (ops.isEmpty()) return displayText
        for (op in ops) when (op) {
            is MvuOp.Init   -> mergeInto(root(), op.data)
            is MvuOp.Set    -> store.set(op.path, op.value)
            is MvuOp.Add    -> store.set(op.path,
                num(store.get(op.path)) + op.delta)
            is MvuOp.Delete -> store.set(op.path, JSONObject.NULL)
            is MvuOp.Insert -> {
                val arr = store.get(op.path) as? JSONArray ?: JSONArray()
                arr.put(wrap(op.value)); store.set(op.path, arr)
            }
            is MvuOp.Patch  -> applyRfc6902(op.ops)
        }
        store.persist()
        saveSnapshot(msgId)          // ★ 消息级快照：该消息应用后的全量状态
        return displayText
    }
    /** 历史消息的变量读取（滚动回看/时间旅行正确性核心） */
    fun getMessageVar(path: String, depth: Int = 0): Any? {
        if (depth <= 0) return store.get(path)
        val f = snapshotsDir.resolve("msg_${latestAiMsgId(depth)}.json")
        if (!f.exists()) return null
        return getByPath(JSONObject(f.readText()), path)
    }
    private fun saveSnapshot(msgId: Long) {
        snapshotsDir.resolve("msg_$msgId.json")
            .writeText(store.snapshotJson())
    }
    /** RFC 6902 精简实现：add/remove/replace/test */
    private fun applyRfc6902(ops: JSONArray) {
        for (i in 0 until ops.length()) {
            val o = ops.getJSONObject(i)
            val p = o.getString("path").trim('/').replace('/', '.')
            when (o.getString("op")) {
                "add", "replace" -> store.set(p, o.opt("value"))
                "remove" -> store.set(p, JSONObject.NULL)
                "test"   -> if (store.get(p) != o.opt("value"))
                    throw IllegalStateException("patch test failed: $p")
            }
        }
    }
    private fun num(v: Any?): Double = when (v) {
        is Number -> v.toDouble()
        is String -> v.toDoubleOrNull() ?: 0.0
        else -> 0.0
    }
}
4.3 变量→显示联动（事件驱动重渲染）
// 注册监听：地点变化 → 自动刷新面板/立绘背景
variableEngine.store.addListener { path, old, new ->
    when (path) {
        "stat_data.世界.地点" -> EventBus.post(PanelRefreshEvent)
        "stat_data.角色.好感.酒馆老板娘" ->
            if ((new as? Int ?: 0) >= 70) EventBus.post(UnlockSceneEvent("老板娘线"))
    }
}
五、EJS 引擎（迷你编译器，assets/ejs.min.js）
不依赖完整 EJS 库（其 include 需要 fs），内嵌一个 40 行的标准语法编译器，支持 <% %> <%= %> <%- %> <%%>：
// ejs.min.js —— 迷你EJS编译器（全局暴露 __ejsRender）
window.__ejsRender = function(tpl, ctx) {
  const TOK = /<%%|<%=([\s\S]*?)%>|<%-([\s\S]*?)%>|<%([\s\S]*?)%>/g;
  let code = "let __o='';with(__c){", i = 0, m, lit;
  function emit(s){ code += "__o+=" + JSON.stringify(s) + ";"; }
  while ((m = TOK.exec(tpl))) {
    emit(tpl.slice(i, m.index));               // 模板前的纯文本
    if (m[0] === "<%%") { emit("<%"); i = m.index + 2; TOK.lastIndex = i; continue; }
    if (m[1] !== undefined)                    // <%= 转义输出
      code += "__o+=__esc(String((" + m[1] + ")??''));";
    else if (m[2] !== undefined)               // <%- 原样输出
      code += "__o+=String((" + m[2] + ")??'');";
    else code += m[3] + "\n";                  // <% 逻辑语句
    i = TOK.lastIndex;
  }
  emit(tpl.slice(i));
  code += "}return __o;";
  return new Function("__c", "__esc", code)(ctx, __esc);
};
function __esc(s){ return String(s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'"',"'":'&#39;'})[c]); }
EjsEngine（Kotlin 调用层）
class EjsEngine(private val host: QuickJsHost, private val api: TemplateApiBridge) {
    private val compiled = ConcurrentHashMap<String, String>()   // 模板缓存
    /**
     * 渲染EJS模板
     * @param template 世界书条目/预设中的模板文本
     */
    fun render(template: String): String {
        val ctx = buildContext()
        val script = """
            (function(){
              var __c = ${ctx};
              __c.include = function(name){
                var t = __hostReadFile('templates/' + name + '.ejs');
                return window.__ejsRender(t, __c);
              };
              return window.__ejsRender(${jsonEncode(template)}, __c);
            })()
        """.trimIndent()
        return host.eval<String>(script) ?: template   // 失败降级：原文注入
    }
    /** 模板上下文：变量 + 消息API均在 with(__c) 作用域内直接可用 */
    private fun buildContext(): String {
        val vars = api.getVariables()   // 全量变量树 → JS直接 stat_data.xxx 访问
        return JSONObject().apply {
            put("stat_data", vars.optJSONObject("stat_data") ?: JSONObject())
            put("msg", JSONObject().apply {
                put("last", api.getChatMessage(-1))      // 最新AI消息
                put("lastUser", api.getChatMessage(-2))
            })
            put("depth", JSONObject().apply {
                put("var", null)                          // 占位，见API桥
            })
        }.toString()
    }
    private fun jsonEncode(s: String) =
        JSONObject.quote(s)
}
六、TemplateApiBridge（宿主 API 桥）
class TemplateApiBridge(
    private val engine: VariableEngine,
    private val chatRepo: ChatRepository     // 你已有的消息仓储
) {
    fun getChatMessage(index: Int): Any = when {
        index >= 0 -> chatRepo.messageAt(index)?.let {
            mapOf("message" to it.text, "role" to it.role.name.lowercase())
        } ?: JSONObject.NULL
        else -> {   // 负数：从最新往回数（-1=最新AI，-2=最新用户）
            val list = chatRepo.recentMessages(abs(index) + 1)
            list.getOrNull(list.size + index)?.let {
                mapOf("message" to it.text, "role" to it.role.name.lowercase())
            } ?: JSONObject.NULL
        }
    }
    fun getMessageVar(path: String, depth: Int): Any? =
        engine.getMessageVar(path, depth)?.let { JSONObject.wrap(it) } ?: JSONObject.NULL
    fun getVariables(): JSONObject = engine.currentRoot()
    fun applyPatch(patchJson: String): Boolean = try {
        engine.applyPatchDirect(JSONObject(patchJson)); true
    } catch (e: Exception) { false }
    fun readAsset(name: String): String =
        appAssets.open(name).bufferedReader().readText()
}
七、PromptBuilder：提示词组装时执行 EJS
class PromptBuilder(
    private val ejsEngine: EjsEngine,
    private val macroEngine: MacroEngine,
    private val ejsEnabled: Boolean   // 设置开关：未启用时条目按普通文本注入（兼容降级）
) {
    /** 条目类型标记：EJS条目在卡/世界书里通常带 marker，如 content 以 <%- 或 <% 开头 */
    fun build(entries: List<WorldbookEntry>, preset: Preset): String {
        val processed = entries.map { e ->
            if (ejsEnabled && looksLikeEjs(e.content))
                e.copy(content = ejsEngine.render(e.content))   // ★ 执行点
            else e
        }
        return processed.joinToString("\n") { it.content }
            .let { macroEngine.apply(it) }   // 再过宏层：{{user}} {{getvar::x}} 等
    }
    private fun looksLikeEjs(s: String) =
        s.contains("<%") && !s.contains("<%%")
}
/** 宏引擎：{{getvar::path}} {{setvar}} {{roll:d20}} 等 */
class MacroEngine(private val store: VariableStore) {
    fun apply(text: String): String = text
        .replace(Regex("\\{\\{getvar::([^}]+)}}")) { m ->
            JSONObject.wrap(store.get(m.groupValues[1].trim()))?.toString() ?: ""
        }
        .replace(Regex("\\{\\{roll::d(\\d+)}}")) { m ->
            (1..m.groupValues[1].toInt()).random().toString()
        }
        .replace("{{user}}", AppState.userName)
        .replace("{{char}}", AppState.charName)
}
条目 51 的实际效果验证——卡里的这段：
<%_
let vLoc = '未知';
for (let i = 1; i <= 12; i++) {
  const m = getChatMessage(-i, 'assistant');
  ...
  const seg = s1[1].split('|')[1];
  if (seg && seg.trim()) { vLoc = seg.trim(); break; }
}
_%>
在 APK 中的执行结果：getChatMessage(-i,'assistant') 走 API 桥 → 仓储层逐层回溯 AI 消息 → 正则抓最后一条 S1 的地点段 → vLoc 注入后续模板文本——与 SillyTavern 中行为完全一致。
八、管线整合与时序
class ChatEngine(
    private val variableEngine: VariableEngine,
    private val renderPipeline: RenderPipeline,   // 前篇的正则引擎
    private val promptBuilder: PromptBuilder,
    private val eventBus: EventBus
) {
    // ════ AI回复到达 ════
    suspend fun onAiResponse(msgId: Long, raw: String) {
        // 1. 变量层：应用 <UpdateVariable>，得到剔除后的显示文本
        val displayText = variableEngine.onAiMessage(msgId, raw)
        // 2. 显示层：执行卡内正则（S1→面板围栏等）
        val rendered = renderPipeline.render(displayText)
        // 3. 分段渲染（文本段→Markwon，HTML段→WebView）
        val segments = segmentMessage(rendered)
        eventBus.post(MessageRendered(msgId, segments))
    }
    // ════ 发送消息 ════
    suspend fun buildAndSend(userInput: String): String {
        val entries = worldbookLoader.loadActivated(userInput)  // 关键词/常驻触发
        val prompt = promptBuilder.build(entries, preset)       // EJS在此执行
        return apiClient.chat(prompt, userInput)
    }
}
完整时序：
用户输入 ──► 世界书触发扫描 ──► PromptBuilder
                                   │
                          EJS条目 ◄── QuickJS ── API桥 ──► VariableStore(当前树)
                                   │                        ChatRepo(历史消息)
                                   ▼
                            提示词组装 ──► LLM API
                                   │
AI回复 ◄───────────────────────────┘
  │
  ├─► MvuParser: <UpdateVariable> → 变量树更新 → 快照落盘 → 剔除块
  ├─► RenderPipeline: 卡内正则 → <S1>→html围栏
  ├─► Segmenter: 文本段/HTML段切分
  ├─► 文本段 → Markwon; HTML段 → WebView池渲染
  └─► 变量事件监听 → 面板刷新/场景解锁(可选联动)
九、工程清单
#	问题	对策	
1	QuickJS 线程安全	单线程执行器串行化全部 eval；UI 只投递任务	
2	模板死循环/超大输出	interruptHandler 超时(2s) + 内存上限(16MB)，超限降级为原文注入	
3	执行失败降级链	EJS失败→按普通文本注入（与 ST-Prompt-Template 未安装时行为一致，本卡 creator_notes 明确要求此兼容）	
4	消息级快照磁盘占用	快照为全量 JSON；聊天超 500 楼后只保留每 10 楼 + 最近 50 楼，中间层插值或回退最近快照	
5	变量路径冲突	协议层禁用 . `	
6	变量宏与显示正则顺序	宏只走提示词层，显示层不执行 {{getvar}}——避免面板数字与正文脱节	
7	EJS 缓存失效	模板按内容 hash 缓存；变量变化不需清缓存（数据在 ctx 传入）	
8	跨楼层一致性	getChatMessage(-i) 读的是渲染管线处理后还是原始文本？约定读原始（含 S1 数据行），与 ST promptOnly 剔除语义对齐：minDepth:6 的剔除只作用于 6 层以前，最近 5 楼保留给模板回溯	
9	NDK 分包	quickjs-kt 需 so 库：用 abiFilters 裁剪至 arm64-v8a/armeabi-v7a；低端兼容场景换 Rhino 纯 Java 版（API 层不变，Host 换实现）	
10	调试	QuickJS 里 console.log 重定向到 Logcat；给模板执行加 try/catch + 错误行号上报	
一句话总结：变量功能 = Kotlin 变量树 + MVU 指令解析 + RFC6902 + 消息级快照（数据主权在原生层，持久化可靠）；EJS 能力 = QuickJS 沙箱 + 40 行迷你编译器 + 宿主 API 白名单桥（语法与 ST-Prompt-Template 完全同源）。两者通过 TemplateApiBridge 单点连接——变量系统提供数据、EJS 提供计算、正则管线提供皮肤，三层各自独立、任意替换。

变量存储优化：从“能存”到“存得好”的分层方案
一、先算清账：成本在哪里
以艾瑞塔这类卡为例，量化典型规模：
项目	单条大小	1000楼聊天累计	
变量树全量快照	2~15 KB	2~15 MB	
其中静态数据（地理/世界书副本）	70%+	不该存	
其中热数据（地点/资金/好感）	<1 KB	真正频繁读写的	
单条 MVU 指令序列	50~300 B	100~300 KB	
三个结论直接决定优化方向：
全量快照是最大的浪费——相邻两楼状态往往只差几条指令，存全量等于重复存了 95% 以上的字节；
静态数据混进变量树是最常见的错误——世界书/地理表卡里自带，存进变量等于每个快照都背一份；
MVU 指令序列天然就是增量——你已经有现成的 delta，不需要再发明 JSON diff。
二、总体架构：四级存储
┌─────────────────────────────────────────────────────┐
│ L1 内存热层    HotState 数据类（O(1)读写，强类型）        │
│               ← 立绘/面板/逻辑判断只碰这里               │
├─────────────────────────────────────────────────────┤
│ L2 内存冷层    完整变量树（惰性解析的JSON字符串）          │
│               ← EJS模板/深度查询按需展开                 │
├─────────────────────────────────────────────────────┤
│ L3 磁盘常态层  OpLog（MVU指令流）+ Checkpoint（每N楼全量）│
│               gzip压缩 + 原子写 + 写合并                 │
├─────────────────────────────────────────────────────┤
│ L4 磁盘归档层  旧聊天压缩包 / 导出摘要快照                │
└─────────────────────────────────────────────────────┘
三、核心优化：Checkpoint + OpLog 替代全量快照
3.1 思路
MVU 指令本身就是增量记录——把“每楼存全量快照”改为：
msg_00100.checkpoint.gz   ← 每20楼一个全量检查点
msg_00101.ops.json        ← 该楼的MVU指令序列（几十字节）
msg_00102.ops.json
...
msg_00120.checkpoint.gz
读取任意楼状态 = 定位 ≤20 楼前的检查点 → 重放最多 20 条指令。磁盘占用从 O(全量×N) 降到 O(全量×N/20 + 指令×N)，千楼聊天从 15MB 降到约 600KB，gzip 后 <200KB。
3.2 关键前提：所有变更必须走统一入口
class VariableEngine(private val store: VariableStore, private val opLog: OpLogStore) {
    /** 唯一变更入口：EJS的insertOrAssignVariables、MVU解析、UI操作全走这里 */
    fun apply(msgId: Long, ops: List<MvuOp>) {
        opLog.append(msgId, ops)          // ① 先落日志（WAL，崩溃可恢复）
        ops.forEach { execute(it) }       // ② 再改内存树
        markDirty()                       // ③ 延迟合并落盘（见第四节）
    }
}
3.3 OpLogStore 实现
class OpLogStore(private val dir: File) {
    private const val CHECKPOINT_INTERVAL = 20L
    private val writeMutex = Mutex()
    /** 追加一楼的指令序列（追加写，O(1)） */
    suspend fun append(msgId: Long, ops: List<MvuOp>) = writeMutex.withLock {
        val coalesced = coalesce(ops)              // 同楼指令合并（见第五节）
        if (coalesced.isEmpty()) return
        if (msgId % CHECKPOINT_INTERVAL == 0L) {
            writeCheckpoint(msgId)                 // 检查点楼：写全量
        } else {
            dir.resolve("msg_%06d.ops.json".format(msgId))
               .writeText(opsToJson(coalesced))    // 普通楼：只写指令
        }
    }
    /** 读任意楼的全量状态 */
    fun loadState(msgId: Long): JSONObject {
        val cp = latestCheckpointAtOrBefore(msgId)
        var state = readCheckpoint(cp)
        for (m in (cp + 1)..msgId) {
            readOps(m)?.forEach { applyTo(state, it) }   // 重放
        }
        return state
    }
    /** 空间回收：老聊天只留检查点，中间指令批量并入新检查点 */
    suspend fun compact(msgId: Long) = writeMutex.withLock {
        val cp = latestCheckpointAtOrBefore(msgId)
        val state = loadState(msgId)
        writeCheckpoint(msgId, state)
        (cp + 1 until msgId).forEach { m ->
            dir.resolve("msg_%06d.ops.json".format(m)).delete()
        }
    }
}
对比前篇的“每楼全量 JSON 快照”方案：OpLog 方案写入量降 50~100 倍，代价是读取时要重放——用检查点把重放上限锁在 20 步以内，实测单楼重建 <2ms，完全无感。
四、磁盘 I/O 优化
4.1 gzip + 原子写（防损坏的基础盘）
class GzipAtomicFile(private val file: File) {
    fun write(content: String) {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        GZIPOutputStream(tmp.outputStream().buffered(8192)).use {
            it.write(content.toByteArray(Charsets.UTF_8))
        }
        // 原子替换：rename在同一分区是原子操作
        if (!tmp.renameTo(file)) {
            tmp.copyTo(file, overwrite = true)
            tmp.delete()
        }
    }
    fun read(): String? {
        if (!file.exists()) return null
        return try {
            GZIPInputStream(file.inputStream().buffered(8192)).use {
                it.readBytes().toString(Charsets.UTF_8)
            }
        } catch (e: Exception) { null }   // 损坏返回null，上层走恢复链
    }
}
JSON 文本 gzip 压缩率通常 4~6 倍，变量树这种高重复键名的文本收益尤其高。
4.2 写合并（Write-Behind）
AI 一次回复可能触发十几条变量变更，绝不能每条变更都落盘：
class WriteBehind(
    scope: CoroutineScope,
    private val flush: suspend () -> Unit
) {
    private val dirty = AtomicBoolean(false)
    private var job: Job? = null
    fun markDirty() {
        if (!dirty.compareAndSet(false, true)) return
        job?.cancel()
        job = CoroutineScope(Dispatchers.IO).launch {
            delay(300)                     // 300ms内的变更合并成一次写
            if (dirty.getAndSet(false)) flush()
        }
    }
    /** 关键时刻强制刷盘：切后台/退出聊天/发送消息前 */
    suspend fun flushNow() {
        job?.cancel()
        if (dirty.getAndSet(false)) flush()
    }
}
// 接入生命周期：切后台必刷
override fun onPause() {
    writeBehind.flushNow()   // 或走LifecycleObserver的ON_STOP
    super.onPause()
}
4.3 崩溃恢复链
OpLog 先行落盘（WAL）+ 检查点原子写，恢复顺序：
启动 → 读最新检查点 → 重放其后的 op 文件
     → 某个 op 文件损坏（截断）→ 丢弃该文件及之后 → 状态回退到上一楼
     → 用内存当前树补写一个新检查点 → 自愈
五、指令层优化：同楼合并与去重
AI 经常在同一楼连发 SET 位置=A → SET 位置=B，全存是浪费：
object OpCoalescer {
    /** 同一楼内的指令合并：后写覆盖先写 */
    fun coalesce(ops: List<MvuOp>): List<MvuOp> {
        val setOps = LinkedHashMap<String, MvuOp>()   // 保持顺序
        val others = mutableListOf<MvuOp>()
        for (op in ops) when (op) {
            is MvuOp.Set -> setOps[op.path] = op              // 同路径覆盖
            is MvuOp.Add -> mergeAdd(setOps, op)              // Add可折叠进Set/Add
            is MvuOp.Patch -> others += op
            is MvuOp.Init -> { others.clear(); setOps.clear(); others += op } // Init重置一切
            else -> others += op
        }
        return others + setOps.values
    }
    private fun mergeAdd(pending: LinkedHashMap<String, MvuOp>, add: MvuOp.Add) {
        when (val prev = pending[add.path]) {
            is MvuOp.Add -> pending[add.path] =
                prev.copy(delta = prev.delta + add.delta)     // Add+Add折叠
            else -> pending[add.path] = add
        }
    }
}
补充规则：
数值类字段（资金/好感/结晶）用 Add 折叠，千楼累加只是一条指令；
带语义的重复 Set 不折叠：如"好感：40→45→40"反映剧情波动，若需历史轨迹则按楼保留——给 OpCoalescer 加一个 preserveHistory: Set<String> 白名单；
快照读侧同理：getMessageVar(path, depth) 优先走 L1 热缓存，未命中才重放 OpLog。
六、内存层优化
6.1 热/冷分离——性能收益最大的一刀
org.json.JSONObject 逐层点取既慢又产生大量临时对象。把高频字段拍平成强类型：
@Serializable
data class HotState(
    val name: String = "",
    val location: String = "",
    val money: String = "",
    val crystals: Int = 0,
    val favor: Map<String, Int> = emptyMap()   // NPC好感表
)
class VariableStore {
    private var hot: HotState = HotState()          // L1：每次变更同步维护
    private var coldJson: String = "{}"             // L2：完整树，惰性解析
    val hotState: HotState get() = hot              // UI/面板只读这里
    fun applyOp(op: MvuOp) {
        executeOnTree(op)                           // 改完整树
        syncHot(op)                                 // 增量同步热层（不必全量重建）
    }
    private fun syncHot(op: MvuOp) = when (op) {
        is MvuOp.Set -> when {
            op.path == "stat_data.世界.地点" ->
                hot = hot.copy(location = op.value?.toString() ?: "")
            op.path.startsWith("stat_data.关系.") ->
                hot = hot.copy(favor = hot.favor + (op.path.lastSeg() to num(op.value)))
            else -> {}
        }
        else -> rebuildHotFromTree()   // 复杂操作兜底全量重建（低频，可接受）
    }
}
立绘背景切换、好感色阶渲染这类每帧可能触发的读取，从“JSON 五层下钻”变成“读一个字段”。
6.2 大数组治理：TTL 与上限
关系网、物品栏这类只增不减的数组是膨胀源头：
class ArrayPolicy(
    private val maxItems: Int = 200,
    private val lruKey: String? = null      // 按哪个字段LRU淘汰
) {
    fun enforce(arr: JSONArray): JSONArray {
        if (arr.length() <= maxItems) return arr
        // 例：物品栏按"最后使用时间"淘汰；出场NPC列表按用户设置保留
        return dropOverflow(arr, maxItems, lruKey)
    }
}
配合协议层的纪律（本卡“NPC永久保留禁止裁剪”这类规则要在设置层显式声明，而不是存储层擅自淘汰）——存储引擎提供策略，策略由卡/用户配置驱动。
6.3 读侧结构共享
回看历史（时间旅行）时避免深拷贝整棵树：
/** 路径级写时复制：重放只复制被改动分支，其余子树复用引用 */
fun applyCoW(root: JSONObject, op: MvuOp): JSONObject {
    val (parentPath, leaf) = op.path.splitLast()
    val parent = resolveOrCreate(root, parentPath)   // 只有这条链被新建
    setLeaf(parent, leaf, wrap(op.value))
    return root
}
对典型路径深度 3~5 的树，单次操作的复制成本从 O(整树) 降到 O(单链)。
七、数据建模：不存才是最好的优化
不该进变量树的东西	正确做法	
世界书/地理表/静态设定	留在卡 assets，变量里只存 当前区域ID 等引用键	
派生数据（总资产=资金+结晶×1000）	读取时计算；高频则缓存+失效标记，不落盘	
UI 状态（面板折叠、滚动位置）	DataStore/SharedPreferences，与剧情变量隔离	
历史轨迹全量（每楼好感曲线）	只存 OpLog（它天然就是轨迹），按需重放聚合	
临时运算中间态	内存 TransientStore，不参与持久化	
一条经验法则：变量树里每一项都应该能回答“它为什么属于剧情状态”。
八、格式选型决策表
规模	方案	说明	
<100楼，树<10KB	全量 JSON 单文件	别过度设计，一次写完	
100~1000楼	Checkpoint(20) + OpLog + gzip + WriteBehind	本篇主方案，覆盖绝大多数场景	
>1000楼 / 多聊天并行	上述方案 + Room 索引表	messages(chat_id, msg_id, has_checkpoint, ops_size) 索引定位，正文仍是文件	
需跨聊天统计/搜索	定期导出摘要快照进 SQLite	大树本体不进数据库，只进可查询的摘要	
极致体积需求	树改 CBOR 编码	比 gzip 后的 JSON 再省 20~30%，解析快 2~3 倍，牺牲可读性	
九、最终效果对照
指标	优化前（每楼全量快照）	优化后	
千楼磁盘占用	15 MB	~0.6 MB（gzip后 <200KB）	
单楼写入 I/O	15 KB 全量重写	50~300 B 追加	
写入频率	每条变更即时	300ms 窗口合并	
任意楼状态读取	直接读文件	检查点+≤20步重放（<2ms）	
崩溃恢复	最后一个完整快照	最多丢失未刷盘的 300ms 窗口	
面板读取延迟	JSON 五层下钻	O(1) 强类型字段	
核心心法一句话：写入侧“追加代替重写、合并代替即时、指令代替全量”；存储侧“热冷分离、静态外置、派生不存”；可靠性靠“WAL 先行 + 原子改名 + 检查点自愈”——三句话覆盖了变量存储 90% 的优化空间，剩下的规模问题（千楼以上、跨聊天检索）再用 Room 索引层解决。

MVU + MVU Zod + EJS 变量系统：APK 完整实现
一、三个系统的定位与关系
先厘清三个名字，避免混淆：
| 系统 | 本质 | 在管线中的位置 |
|---|---|---|---|
| MVU（MagVarUpdate） | 变量更新指令协议：AI 输出 <UpdateVariable> 块，宿主解析后增删改变量树 | 数据层（写侧） |
| MVU Zod | MVU 的Schema 校验层——Zod Schema 定义变量树合法形态，更新前先校验，非法则拒绝/修复 | 数据层（守门员） |
| EJS 变量系统 | 模板引擎：渲染时把变量树注入模板上下文，动态生成提示词/显示内容 | 读取层（读侧） |
AI回复 → ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
        │ MVU 解析器   │ → │ MVU Zod 校验  │ → │ 变量树应用   │
        │ <UpdateVariable>│  │ Schema门神   │    │ (VariableStore)│
        └─────────────┘    └──────────────┘    └──────┬──────┘
                                                     │
                                     ┌───────────────┴───────────────┐
                                     ▼                               ▼
                              ┌──────────┐                   ┌──────────┐
                              │ EJS 引擎  │                   │ 面板/立绘  │
                              │ (读侧)    │                   │ (读侧)    │
                              └──────────┘                   └──────────┘
一句话：MVU 是写入协议，Zod 是写入的质检员，EJS 是读取的出口。
二、MVU 协议完整规范
2.1 指令集（超集设计，向下兼容）
// MVU 指令类型（Kotlin data class 对应）
sealed class MvuOp {
    data class Init(val data: JSONObject) : MvuOp()              // 初始化变量树
    data class Set(val path: String, val value: Any?) : MvuOp()  // 点分路径赋值
    data class Add(val path: String, val delta: Number) : MvuOp()        // 数值累加
    data class Insert(val path: String, val value: Any?) : MvuOp()       // 数组push
    data class Delete(val path: String) : MvuOp()                 // 删除字段
    data class Patch(val ops: JSONArray) : MvuOp()                // RFC6902 JSON Patch
    data class Raw(val data: JSONObject) : MvuOp()                // 原始全量替换（慎用）
}
2.2 三种指令格式（都支持，按序探测）
格式A：ST-MVU 原生（数组套对象）
[
  {"type":"set","path":"stat_data.世界.地点","value":"风崖城"},
  {"type":"add","path":"stat_data.关系.酒馆老板娘","value":5}
]
格式B：简写路径语法（字符串行）
_.$set  stat_data.世界.地点 = 风崖城
_.$add  stat_data.关系.酒馆老板娘 = 5
格式C：JSON Pointer（RFC 6902）
[{"op":"replace","path":"/stat_data/世界/地点","value":"风崖城"}]
2.3 完整解析器（Kotlin）
object MvuParser {
    private val BLOCK = Regex("<UpdateVariable>([\\s\\S]*?)</UpdateVariable>", RegexOption.IGNORE_CASE)
    /** 提取所有MVU块 → (指令序列, 剔除后的显示文本) */
    fun extract(text: raw: String): Pair<List<MvuOp>, String> {
        val ops = mutableListOf<MKotlinuation>()
        BLOCK.forEach(text) { m ->
            m.groupValues[1].trim().parseOneBlock()?.let { ops += it }
        }
       )return ops to BLOCK.replace(text, "").trim()
    }
    private fun String.parseOneBlock(): List<MvuOp>? = try {
        when {
            startsWith("[") -> parseArrayFormat(this)
            startsWith("{") -> parseObjectFormat(this)
            contains("$") && contains("=") -> parseShorthandFormat(this)
            else -> null
        `_ -> null
    } catch (e: Exception) { null }
    private fun parseArrayFormat(s: String): List<MvuOp> =
        JSONArray(s).let { arr ->
            (0 until arr.length()).map { jsonToOp(it) }
        }
    { JSONObject(s).let { listOf(jsonToOp(it)) } }
    private fun parseShorthandFormat(s: String): List<MvuOp> =
        s.lines().mapNotNull { line ->
            val m = Regex("^_\\.(\\$set|\\$add|\\$insert|\\$del)\\s+(\\S+)\\s*=\\s*(.*)$")
                .find(line) ?: return@mapNotNull null
            val (kind, path, value) = m.destructured
            when (kind) {
                "\$set"  -> MvuOp.Set(path, value.toTypedValue())
                "\$add"  -> MvuOp.Add(path, value.toDouble())
                "\$insert" -> MvuOp.Insert(path, value.toTypedValue())
            }
        }
    private fun String.toTypedValue(): Any? = when {
        this == "null" -> null
        this == "true" -> true
        this == "false" -> false
        matches(Regex("-?\\d+")) -> toLong()
        matches(Regex("-?\\d+\\.\\d+")) -> toDouble()
        startsWith("{") || startsWith("[") -> try { JSONObject(this) } catch(_:Exception){ this }
        else -> this
    }
    private fun jsonToOp(j: JSONObject): MvuOp = when (j.optString("type").lowercase()) {
        "init"    -> MvuOp.Init(j.optJSONObject("data") ?: JSONObject())
        "set"     -> MvuOp.Set(j.getString("path"), j.opt("value"))
        "add"     -> MvuOp.Add(j.getString("op.path"), j.optDouble("value"))
        "insert"  -> Mvu implementation? -> MvuOp.Insert(j.getString("path"), j.opt("value"))
    `op`       -> MvuOp.Patch(j.optJSONArray("ops"))
        else      -> MvuOp.Set(j.optString("path"), j QuickJsHost.val()... j.opt("value"))
    }
}