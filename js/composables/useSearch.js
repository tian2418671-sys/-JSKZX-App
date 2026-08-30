import { ref, computed, watch } from 'vue';
import { extractBookEntries } from '../utils/cardLoader.js';
import searchIndex from '../utils/searchIndex.js';
import tokenCache from '../utils/tokenCache.js';

/**
 * 瓒呯骇鎼滅储寮曟搸缁勫悎寮忓嚱鏁帮紙Composable锛? * 浠?App.vue 鎷嗗垎鑰屾潵锛屾敹鏁涳細鎼滅储杈撳叆闃叉姈銆佸叏瀛楁绌块€忔绱?楂樼骇璇硶杩囨护/鎺掑簭锛坒ilteredLibrary锛夈€? * 鍒嗛〉璁＄畻锛坱otalPages/paginatedLibrary锛変笌鎹㈤〉閫昏緫锛坈hangePage锛夈€? * 鍏变韩鍝嶅簲寮忕姸鎬侊紙library / currentCategoryKey / allCategories / sortBy / currentPage / itemsPerPage / lastSelectedIndex锛? * 涓庡伐鍏?estimateCardTokens 淇濈暀鍦?App.vue 椤跺眰骞舵敞鍏ワ紝鍏朵綑鐘舵€佷笌璁＄畻鏂规硶鍦ㄦ瀹氫箟銆? */

/**
 * 瀹夊叏鎻愬彇鍗＄墖瀵硅薄鍐呮墍鏈夐€掑綊鍙绱㈠瓧绗︿覆锛堥槻 null/undefined 鎶ラ敊锛屽吋瀹?V1/V2/V3/SillyTavern 鎵╁睍锛? * 瑕嗙洊锛氱墿鐞嗘枃浠跺悕/璺緞/鍒嗙粍銆佽鑹插悕/浣滆€?鎻忚堪/鎬ф牸/鍦烘櫙/棣栨潯寮€鍦虹櫧/瀵硅瘽绀轰緥/浣滆€呭娉ㄣ€? * 澶囬€夊紑鍦虹櫧鍒楄〃銆佹繁搴︽彁绀鸿瘝/绯荤粺鎻愮ず璇嶃€佹鍒欒剼鏈€佸唴宓屼笘鐣屼功鍏ㄩ儴璇嶆潯锛堝悕绉?娉ㄩ噴/瑙﹀彂璇?姝ｆ枃锛? */
export function extractCardSearchableText(item) {
    const data = (item && item.data && item.data.data) || (item && item.data) || {};
    const textSegments = [];
    const push = (v) => { if (v !== undefined && v !== null && v !== '') textSegments.push(String(v)); };

    // 1. 鍩虹鐗╃悊涓庣郴缁熶俊鎭?
        if (item && item.fileName) push(item.fileName);
        if (item && item.path) push(item.path);
    if (item && item.subFolder) push(item.subFolder); // 鐗╃悊鍒嗙粍
    if (item && item.category) push(item.category);
    if (item && item.name) push(item.name);
    if (item && item.creator) push(item.creator);

    // 2. 鏍稿績浜鸿鏂囨湰
    push(data.name);
    push(data.creator || data.author);
    push(data.description);
    push(data.personality);
    push(data.scenario);
    push(data.first_mes);
    push(data.mes_example);
    push(data.creator_notes);

    // 3. 澶囬€夊紑鍦虹櫧 (Alternate Greetings)
    if (Array.isArray(data.alternate_greetings)) {
        push(data.alternate_greetings.map(g => String(g)).join(' '));
    }

    // 4. 鎵╁睍閰嶇疆 (Extensions: depth_prompt / system_prompt / regex_scripts)
    const ext = data.extensions;
    if (ext && typeof ext === 'object') {
        if (ext.depth_prompt && ext.depth_prompt.prompt) push(ext.depth_prompt.prompt);
        if (ext.system_prompt !== undefined && ext.system_prompt !== null) {
            push(typeof ext.system_prompt === 'string' ? ext.system_prompt : JSON.stringify(ext.system_prompt));
        }
        if (Array.isArray(ext.regex_scripts)) {
            ext.regex_scripts.forEach(script => {
                if (!script || typeof script !== 'object') return;
                if (script.scriptName) push(script.scriptName);
                if (script.findRegex) push(script.findRegex);
                if (script.replaceString) push(script.replaceString);
            });
        }
    }

    // 5. 鍏宠仈涓栫晫涔?(Character Book / Lorebook)
    // 馃洝锔?extractBookEntries 鍏ㄥ舰鎬佸畨鍏ㄦ彁鍙栵紙entries 鏁扮粍/瀛楀吀/鏁扮粍 book锛夛細
    //    淇瀛楀吀褰㈡€佷笘鐣屼功鍐呭鏃犳硶琚悳绱?+ 鏁扮粍褰㈡€?book 鐨?.entries 鍘熷瀷鏂规硶闄烽槺
    const book = data.character_book || (item && item.data && item.data.character_book) || (item && item.character_book);
    if (book) {
        extractBookEntries(book).forEach(entry => {
            if (entry.comment || entry.name) push(entry.comment || entry.name);
            if (entry.content) push(entry.content);
            if (Array.isArray(entry.keys)) push(entry.keys.map(k => String(k)).join(' '));
            if (Array.isArray(entry.secondary_keys)) push(entry.secondary_keys.map(k => String(k)).join(' '));
        });
    }

    // 鎷煎悎鎴愬崟涓€鐨勫叏閲忓皬鍐欏瓧绗︿覆娴?    return textSegments.join(' ').toLowerCase();
}

/**
 * 鎻愬彇鍗＄墖鐨勬墍鏈夋爣绛炬暟缁勶紙鍏煎鏁扮粍/閫楀彿鍒嗛殧瀛楃涓?customTags/鍘熺敓 tags锛? */
export function extractCardTags(item) {
    const data = (item && item.data && item.data.data) || (item && item.data) || {};
    const tags = new Set();
    const collect = (t) => {
        if (Array.isArray(t)) {
            t.forEach(x => { if (x !== undefined && x !== null && x !== '') tags.add(String(x).toLowerCase()); });
        } else if (typeof t === 'string' && t.trim() !== '') {
            t.split(',').map(x => x.trim()).filter(Boolean).forEach(x => tags.add(x.toLowerCase()));
        }
    };
    if (item) {
        collect(item.tags);
        collect(item.customTags);
    }
    collect(data.tags);
    return Array.from(tags);
}

export function useSearch({
    library,
    currentCategoryKey,
    allCategories,
    sortBy,
    currentPage,
    itemsPerPage,
    lastSelectedIndex,
    estimateCardTokens
}) {
    // ================= [ 鎬ц兘浼樺寲锛氭悳绱㈤槻鎶?] =================
    const searchQueryInput = ref(''); // 绑定给搜索框的输入值（实时更新）
    const searchQuery = ref('');      // 用于实际过滤的内部值（300ms 防抖延迟更新）
    let searchTimeout = null;

    // 鐩戝惉杈撳叆锛?00ms 鍚庢墠鏇存柊瀹為檯鐨勮繃婊よ瘝
    watch(searchQueryInput, (newVal) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery.value = newVal;
        }, 300);
    });

    // ================= 馃殌 瓒呯骇鎼滅储寮曟搸锛氬叏瀛楁绌块€?+ 楂樼骇璇硶妫€绱?+ 鍏ㄨ鑼冨吋瀹?=================
    // 鏀寔锛氬璇?AND锛堝偛濞?濂充粏锛? -鎺掗櫎璇?/ tag:/t: / author:/a: / file:/f: / wb:/w:
    const filteredLibrary = computed(() => {
        // 鈥斺€?鍒嗙被/蹇嵎绛涢€夛紙鍚壒娈婂揩鎹疯繃婊わ細甯︿笘鐣屼功 / 甯︽鍒欒剼鏈級鈥斺€?
        const passCategory = (card) => {
            if (currentCategoryKey.value === 'all') return true;
            if (currentCategoryKey.value === 'has_lorebook') {
                // 馃摉 甯︿笘鐣屼功锛氬崱鐗囧唴宓屼笘鐣屼功涓旀湁鏉＄洰
                // 馃洝锔?extractBookEntries 鍏ㄥ舰鎬佸畨鍏ㄥ垽瀹氾紙瀛楀吀褰㈡€?entries / 鏁扮粍褰㈡€?book 鍧囨纭瘑鍒級
                const d = card.data?.data || card.data || {};
                const book = d.character_book || card.data?.character_book || {};
                return extractBookEntries(book).length > 0;
            }
            if (currentCategoryKey.value === 'has_regex') {
                // 鈿?甯︽鍒欒剼鏈細鍗＄墖鍐呭祵姝ｅ垯鑴氭湰
                const d = card.data?.data || card.data || {};
                const regex = d.extensions?.regex_scripts || d.regex_scripts || [];
                return (regex || []).length > 0;
            }
            const targetCat = allCategories.value.find(c => c.key === currentCategoryKey.value);
            if (!targetCat) return true;
            const subName = card.subFolder ? card.subFolder.split(/[\/]/)[0] : '';
            return card.category === targetCat.cn || card.category === targetCat.en || card.category === targetCat.key
                || (!!subName && (subName === targetCat.cn || subName === targetCat.en || subName === targetCat.key));
        };

        // 鈥斺€?鎺掑簭閿彁鍙栵紙time 妯″紡锛夆€斺€?        // 馃 v1.9.x銆屾湰鍦版枃浠舵渶鏂般€? 瑙掕壊鍗℃枃浠堕娆″嚭鐜板湪鐢佃剳涓婄殑鏃堕棿锛坆irthtime锛変笌
        //    淇敼鏃堕棿锛坢time锛夊彇杈冩柊鑰呯患鍚堚€斺€旀渶杩戞斁杩涚數鑴戞垨鏈€杩戣淇敼鐨勬枃浠舵帓鍓嶏紝
// (comment)
        const pickTimeLocal = (card) => Math.max(Number(card._mtime) || 0, Number(card._ctime) || 0);
// (comment)
        const pickCtime = (card) => Number(card._ctime) || 0;
// (comment)
        const pickMtime = (card) => Number(card._mtime) || 0;
        // 馃 瀵煎叆鏃堕棿 = 鍗＄墖棣栨杩涘叆鏈簱鐨勬椂鍒伙紙parseAndAddCard 棣栨閬囧埌璇ヨ矾寰勬椂璁板綍骞舵寔涔呭寲锛夛紝
        //   缂哄け鍥為€€鏂囦欢鍒涘缓鏃堕棿锛屽啀鍥為€€褰撳墠鏃跺埢锛堝唴瀛樺鍏ュ満鏅級
        const pickImportTime = (card) => Number(card._importTime) || Number(card._ctime) || 0;
// (comment)
        const pickSize = (card) => Number(card._size) || 0;

        // 鈥斺€?鍒楄〃鎺掑簭锛堝湪杩囨护缁撴灉涓婃帓搴忥紱filter() 杩斿洖鏂版暟缁勶紝鍘熷湴 sort 瀹夊叏锛夆€斺€?        // 馃殌 v1.8.5 鎬ц兘淇锛歵okens 鎺掑簭鏀逛负棰勮绠楋紙Schwartzian transform锛夈€?        //    鏃х増姣旇緝鍣ㄥ唴宓?estimateCardTokens(b) - estimateCardTokens(a)锛氬崈鍗″簱涓€娆?        //    鎺掑簭璋冪敤浼扮畻 ~2路N路logN 娆★紙姣忓崱鍏ㄥ瓧娈垫嫾鎺?+ 姝ｅ垯 + 涓栫晫涔﹀叏鏉＄洰閬嶅巻锛夛紝
        //    姣忔杈撳叆/鍒囧垎缁勯兘閲嶈窇 鈫?绉掔骇鍐荤粨銆傜幇鏀逛负姣忓崱鍙畻涓€娆★紙鍙犲姞 App.vue 鐨?        //    WeakMap 缂撳瓨锛屾湭鍙樻洿鍗＄洿鎺ュ懡涓紦瀛橈級锛屾垚鏈粠 O(N log N) 闄嶄负 O(N)銆?        // 馃洝锔?鍗＄墖绾?try/catch 鍏滃簳淇濈暀锛氳剰鍗′及绠楀け璐ユ寜 0 璁★紝鎺掑簭姘镐笉鎶涢敊锛堥槻鐧藉睆锛夈€?        // 馃敡 v1.8.6 绋冲畾鎬т慨澶嶏細鎵€鏈夋帓搴忛兘甯︺€岀ǔ瀹氭绾ч敭銆嶏紙鍚嶇О/璺緞锛夛紝
        //    娑堥櫎鍚屽悕/鍚屾椂鍒?鍚?Token 鍗＄墖椤哄簭渚濊禆鎵弿椤哄簭锛坮eaddir 涓嶄繚璇佺ǔ瀹氾級鐨勯棶棰樷€斺€?        //    鍚﹀垯姣忔鍚姩/鍒锋柊鍚庤繖绫诲崱鐗囩殑鐩稿椤哄簭鍙兘鍙樺寲锛岃鎰熶负銆屾帓搴忚鎵撲贡銆嶃€?        // 馃 v1.9.x 鎺掑簭澧炲己锛堝姞鍥猴級锛氱粺涓€姣旇緝鍣ㄤ笁浠跺鈥斺€?        //    鈶?Intl.Collator('zh-Hans-CN', { numeric:true })锛氫腑鏂囨寜鎷奸煶銆佹暟瀛楁鎸夋暟鍊?        //       鑷劧鎺掑簭锛?V2.5" < "V10"銆?绗?绔? < "绗?0绔?锛屼笉鍐嶅嚭鐜?V10 鎺掑埌 V2 鍓嶏級锛?        //    鈶?鍚嶇О trim 褰掍竴锛堝幓鍓嶅/灏鹃殢绌烘牸锛岄伩鍏嶇┖鏍煎樊寮傚鑷翠綅缃紓绉伙級锛?        //    鈶?缁堟瀬绋冲畾閿摼銆岃矾寰?鈫?鏂囦欢鍚?鈫?id銆嶅厹搴曪細浠讳綍鎯呭喌锛坮eaddir 涔卞簭銆侀噸鎵弿銆?        //       鍚屽悕鍚岃矾寰勶級涓嬬浉瀵归『搴忛兘瀹屽叏纭畾锛岀粷涓嶃€岃倖鎰忎贡绐溿€嶃€?
        const collator = (() => {
            try { return new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'variant' }); }
            catch (e) { return new Intl.Collator('zh-Hans-CN', { numeric: true }); }
        })();
        const nameKey = (card) => String(card?.name ?? '').trim();
        const pathKey = (card) => String(card?.path ?? '');
        const fileKey = (card) => String(card?.fileName ?? '');
        const idKey = (card) => String(card?.id ?? '');
        // 鏂囨湰姣旇緝锛氭嫾闊?+ 鏁板瓧鑷劧鎺掑簭锛涘紓甯哥幆澧冨洖閫€鏅€?localeCompare / 閫愬瓧绗︽瘮杈?
        const cmpText = (a, b) => {
            try { const r = collator.compare(a, b); if (r) return r; } catch (e) { /* fallthrough */ }
            try { return a.localeCompare(b, 'zh-Hans-CN'); } catch (e) { /* fallthrough */ }
            return a < b ? -1 : a > b ? 1 : 0;
        };
        // 缁堟瀬绋冲畾閿摼锛氳矾寰?鈫?鏂囦欢鍚?鈫?id锛屼繚璇侀『搴忓畬鍏ㄧ‘瀹氾紙涓嶄緷璧?readdir 椤哄簭锛?
        const stableChain = (a, b) =>
            cmpText(pathKey(a), pathKey(b))
            || cmpText(fileKey(a), fileKey(b))
            || cmpText(idKey(a), idKey(b));
        const sortList = (arr) => {
            if (sortBy.value === 'name') {
                // 馃敜 A-Z 姝ｅ簭锛氫富閿?= 鐗╃悊鏂囦欢鍚嶏紙涓庤祫婧愮鐞嗗櫒涓€鑷达紝澶╃劧鍞竴锛夛紝娆＄骇 = 鏄剧ず鍚嶏紝涓夌骇 = 绋冲畾閾?
        return arr.sort((a, b) => {
                    try {
                        return cmpText(fileKey(a), fileKey(b))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'nameDesc') {
                // 馃敜 A-Z 鍊掑簭锛氭搴忔瘮杈冪粨鏋滄暣浣撳彇璐燂紙杩炵ǔ瀹氶摼涓€璧风炕杞紝椤哄簭瀹屽叏纭畾锛?
        return arr.sort((a, b) => {
                    try {
                        const r = cmpText(fileKey(a), fileKey(b))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                        return -r;
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'time') {
                // 锟?鏈湴鏂囦欢鏈€鏂帮細绾湰鍦版枃浠舵椂闂达紙鍒涘缓鈫掍慨鏀癸級闄嶅簭
                return arr.sort((a, b) => {
                    try {
                        return (pickTimeLocal(b) - pickTimeLocal(a))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'mtime') {
                // 鉁忥笍 淇敼鏃堕棿锛氭枃浠舵渶鍚庝慨鏀规椂鍒伙紙鏂扳啋鏃э級锛涘苟鍒楁椂娆＄骇鐢ㄥ垱寤烘椂闂达紙涓庡垱寤烘椂闂存帓搴忎簰寮傦級
                return arr.sort((a, b) => {
                    try {
                        return (pickMtime(b) - pickMtime(a))
                            || (pickCtime(b) - pickCtime(a))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'ctime') {
                // 馃搮 鍒涘缓鏃堕棿锛氭枃浠剁郴缁熺湡瀹炲垱寤烘椂鍒伙紙鏂扳啋鏃э級锛涘苟鍒楁椂娆＄骇鐢ㄤ慨鏀规椂闂达紙涓庝慨鏀规椂闂存帓搴忎簰寮傦級
                return arr.sort((a, b) => {
                    try {
                        return (pickCtime(b) - pickCtime(a))
                            || (pickMtime(b) - pickMtime(a))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'importTime') {
                // 馃摜 瀵煎叆鏈€鏂帮細鍗＄墖棣栨杩涘叆鏈簱鐨勬椂鍒伙紙鏂扳啋鏃э級
                return arr.sort((a, b) => {
                    try {
                        return (pickImportTime(b) - pickImportTime(a))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'sizeDesc') {
                // 馃摝 澶у皬鍊掑簭锛氭枃浠跺瓧鑺傛暟澶р啋灏?
        return arr.sort((a, b) => {
                    try {
                        return (pickSize(b) - pickSize(a))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'sizeAsc') {
                // 馃摝 澶у皬姝ｅ簭锛氭枃浠跺瓧鑺傛暟灏忊啋澶?
        return arr.sort((a, b) => {
                    try {
                        return (pickSize(a) - pickSize(b))
                            || cmpText(nameKey(a), nameKey(b))
                            || stableChain(a, b);
                    } catch (e) { return 0; }
                });
            }
            if (sortBy.value === 'tokens') {
                return arr
                    .map(card => {
                        try { return [card, tokenCache.get(card)]; }
                        catch (e) { console.warn('Token estimate error, count as 0:', card?.fileName || card?.name, e); return [card, 0]; }
                    })
                    .sort((x, y) => (y[1] - x[1])
                        || cmpText(nameKey(x[0]), nameKey(y[0]))
                        || stableChain(x[0], y[0]))
                    .map(pair => pair[0]);
            }
            // 馃洝锔?鍗囩骇/閰嶇疆鍔犲浐锛氭湭鐭ユ垨闈炴硶鐨勬帓搴忓€硷紙鏃х増鏈畫鐣欍€侀厤缃崯鍧忋€佺櫧鍚嶅崟鏈鐩栫殑鏂板€硷級
            //    涓€寰嬪洖閫€銆屾枃浠剁骇 A-Z 鎺掑簭銆嶏紝缁濅笉杩斿洖鏈帓搴忓師鏁扮粍鈥斺€斿惁鍒欏垪琛ㄩ€€鍖栦负 readdir 纾佺洏椤哄簭锛?            //    姣忔鎵弿/閲嶅惎椤哄簭鍙兘鍙樺寲锛岃鎰熶负銆屾洿鏂板崌绾у悗鎺掑簭涔遍銆嶃€?
        return arr.sort((a, b) => {
                try {
                    return cmpText(fileKey(a), fileKey(b))
                        || cmpText(nameKey(a), nameKey(b))
                        || stableChain(a, b);
                } catch (e) { return 0; }
            });
        };

        // 鏃犲叧閿瘝锛氫粎鎸夊綋鍓嶅垎绫昏繃婊?+ 鎺掑簭锛堟祻瑙堟ā寮忥級
        // 馃洝锔?鍗＄墖绾?try/catch 鍏滃簳锛氫笌涓嬫柟鎼滅储鍒嗘敮闃插尽瀵归綈銆傚巻鍙叉暀璁紙bdced8a + 鏈
// (comment)
        const query = (searchQuery.value || '').toLowerCase().trim();
        if (!query) {
            return sortList(library.value
                .filter(card => {
                    try { return passCategory(card); }
                    catch (e) { console.warn('鈿狅笍 鍒嗙粍绛涢€夊紓甯歌烦杩囧崱鐗?', card?.fileName || card?.name, e); return false; }
                }));
        }

// (comment)
        const rules = { mustInclude: [], mustExclude: [], tagOnly: [], authorOnly: [], fileOnly: [], wbOnly: [] };
        query.split(/\s+/).forEach(token => {
            if (token.startsWith('-') && token.length > 1) rules.mustExclude.push(token.slice(1));
            else if (token.startsWith('tag:') || token.startsWith('t:')) rules.tagOnly.push(token.replace(/^(tag:|t:)/, ''));
            else if (token.startsWith('author:') || token.startsWith('a:')) rules.authorOnly.push(token.replace(/^(author:|a:)/, ''));
            else if (token.startsWith('file:') || token.startsWith('f:')) rules.fileOnly.push(token.replace(/^(file:|f:)/, ''));
            else if (token.startsWith('wb:') || token.startsWith('w:')) rules.wbOnly.push(token.replace(/^(wb:|w:)/, ''));
            else rules.mustInclude.push(token);
        });

// (comment)
        const indexQuery = [...rules.mustInclude, ...rules.tagOnly].join(' ');
        let candidates = library.value;
        
        if (indexQuery && searchIndex.cardCount > 0) {
            // 浣跨敤绱㈠紩鏌ヨ锛屼紶鍏ユ帓闄よ瘝鍜屾爣绛?
            candidates = searchIndex.search(indexQuery, {
                tags: rules.tagOnly,
                excludeKeywords: rules.mustExclude
            }) || [];
        }

        const filtered = candidates.filter(card => {
            try {
                // 1. 鍒嗙被杩囨护锛堟悳绱篃閬靛畧褰撳墠鍒嗙粍/蹇嵎绛涢€夛紱閫?鍏ㄩ儴"= 鍏ㄥ眬妫€绱級
                if (!passCategory(card)) return false;

                const data = card.data?.data || card.data || {};

                // 2. 鎺掗櫎璇嶆牎楠岋紙- 璇硶锛夆€斺€?绱㈠紩宸插鐞嗭紝浣嗛渶浜屾鏍￠獙纭繚鍑嗙‘
                if (rules.mustExclude.length > 0 && searchIndex.cardCount === 0) {
                    const fullText = extractCardSearchableText(card);
                    if (rules.mustExclude.some(ex => fullText.includes(ex))) return false;
                }

                // 3. 鏍囩鐗瑰畾绛涢€夛紙tag:/t: 璇硶锛夆€斺€?绱㈠紩宸插鐞?
                if (rules.tagOnly.length > 0 && searchIndex.cardCount === 0) {
                    const cardTags = extractCardTags(card);
                    if (!rules.tagOnly.every(target => cardTags.some(t => t.includes(target)))) return false;
                }

                // 4. 浣滆€呯壒瀹氱瓫閫夛紙author:/a: 璇硶锛?
                if (rules.authorOnly.length > 0) {
                    const author = String(data.creator || data.author || card.creator || '').toLowerCase();
                    if (!rules.authorOnly.every(a => author.includes(a))) return false;
                }

                // 5. 鐗╃悊鏂囦欢鍚?璺緞绛涢€夛紙file:/f: 璇硶锛?
                if (rules.fileOnly.length > 0) {
                    const fileName = card.fileName || String(card.path || '').split(/[\\/]/).pop() || '';
                    const filePath = `${fileName} ${card.subFolder || ''} ${card.path || ''}`.toLowerCase();
                    if (!rules.fileOnly.every(f => filePath.includes(f))) return false;
                }

                // 6. 涓栫晫涔︿笓鐢ㄧ瓫閫夛紙wb:/w: 璇硶锛?                // 馃洝锔?extractBookEntries 鍏ㄥ舰鎬佸畨鍏ㄦ彁鍙栵細鏃у啓娉曞湪鏁扮粍褰㈡€?book 鏃舵嬁鍒?                //    Array.prototype.entries 鍘熷瀷鍑芥暟锛孞SON.stringify(鍑芥暟)=undefined
                //    鈫?閾惧紡 .toLowerCase() 鐩存帴 TypeError锛堟悳绱㈠嵆宕╋級
                if (rules.wbOnly.length > 0) {
                    const book = data.character_book || card.data?.character_book || card.character_book;
                    const wbText = JSON.stringify(extractBookEntries(book)).toLowerCase();
                    if (!rules.wbOnly.every(w => wbText.includes(w))) return false;
                }

                // 7. 鍏ㄦ枃鏈璇嶅繀鍚牎楠岋紙AND 閫昏緫锛夆€斺€?绱㈠紩宸插鐞?
                if (rules.mustInclude.length > 0 && searchIndex.cardCount === 0) {
                    const fullText = extractCardSearchableText(card);
                    if (!rules.mustInclude.every(kw => fullText.includes(kw))) return false;
                }

                return true;
            } catch (e) {
                // 馃洝锔?寮傚父鍗＄墖鑷姩璺宠繃锛屼繚璇佸垪琛ㄧǔ瀹氭覆鏌撲笉鐧藉睆
                console.warn('鈿狅笍 妫€绱㈠崱鐗囧紓甯歌烦杩?', card.fileName || card.name, e);
                return false;
            }
        });
        return sortList(filtered);
    });

    // 2. 璁＄畻鎬婚〉鏁?
        const totalPages = computed(() => {
        return Math.ceil(filteredLibrary.value.length / itemsPerPage.value) || 1;
    });

    // 3. 褰撳墠椤靛睍绀虹殑鏁版嵁
    const paginatedLibrary = computed(() => {
        const start = (currentPage.value - 1) * itemsPerPage.value;
        const end = start + itemsPerPage.value;
        return filteredLibrary.value.slice(start, end);
    });

    // 杩囨护鏉′欢锛堟悳绱?鍒嗙粍锛夊彉鍖栨椂閲嶇疆鍥炵涓€椤碉紝閬垮厤鍋滅暀鍦ㄨ秴鍑鸿寖鍥寸殑椤甸潰涓?
        watch([searchQuery, currentCategoryKey], () => {
        currentPage.value = 1;
    });

    // 鎹㈤〉閫昏緫
    const changePage = (page) => {
        if (page >= 1 && page <= totalPages.value) {
            currentPage.value = page;
            // 鉁?[琛ヤ竵] 缈婚〉鏃舵竻鐞嗕笂涓€娆＄偣鍑荤储寮曪紝闃叉璺ㄩ〉 Shift 杩為€夊熀浜庨〉鍐呯储寮曡秴鐣岃閫夊綋椤靛崱鐗?
            lastSelectedIndex.value = -1;
        }
    };

    return {
        searchQueryInput, searchQuery,
        filteredLibrary, totalPages, paginatedLibrary,
        changePage
    };
}
