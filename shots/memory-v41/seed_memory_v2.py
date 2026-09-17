# -*- coding: utf-8 -*-
"""测卡记忆 v4.1 模拟器测试：播种 v2 格式旧记忆库（验证 v2→v3 迁移 + JS 回填）
- v2 schema：id,type,content,key,card_name,created_at（user_version=2）
- 4 条 card_name=林墨白（唯一匹配 → 应回填 card_path）
- 1 条 card_name=已删除的老卡（无匹配 → 应留遗留桶 card_path=NULL）
"""
import os
import sqlite3

db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_memory.db')
if os.path.exists(db):
    os.remove(db)

con = sqlite3.connect(db)
cur = con.cursor()
cur.execute(
    'CREATE TABLE memory_items ('
    'id INTEGER PRIMARY KEY AUTOINCREMENT,'
    'type TEXT NOT NULL,'
    'content TEXT NOT NULL,'
    'key TEXT,'
    'card_name TEXT,'
    'created_at INTEGER NOT NULL)'
)
cur.execute('CREATE INDEX idx_mem_type ON memory_items(type)')
cur.execute('PRAGMA user_version=2')

rows = [
    ('fact', '喜欢在深夜研读古籍', '喜欢', '林墨白', 1758000000000),
    ('summary', '林墨白在藏书楼遇到主角，相谈甚欢', '', '林墨白', 1758000001000),
    ('fact', '常去城南的醉仙楼', '位置', '已删除的老卡', 1758000002000),
    ('message', '用户: 晚上好，今晚还读书吗', '', '林墨白', 1758000003000),
    ('message', 'AI: 夜色如水，自然是要读的。', '', '林墨白', 1758000004000),
]
cur.executemany(
    'INSERT INTO memory_items (type,content,key,card_name,created_at) VALUES (?,?,?,?,?)',
    rows
)
con.commit()

# 自检
cur.execute('PRAGMA user_version')
ver = cur.fetchone()[0]
cur.execute('SELECT COUNT(*) FROM memory_items')
cnt = cur.fetchone()[0]
con.close()
print(f'seed ok: user_version={ver}, rows={cnt}, file={db}')
