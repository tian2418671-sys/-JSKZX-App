/**
 * Section 组件
 * 用于展示带标题的文本块（描述、性格、场景等），支持高亮样式
 */
export const Section = {
    props: ['title', 'content', 'highlight'],
    template: `
        <div v-if="content && content.trim() !== ''">
            <h4 class="font-bold text-gray-800 text-lg mb-3">{{ title }}</h4>
            <pre :class="[
                'p-5 border rounded-2xl text-sm whitespace-pre-wrap font-sans leading-relaxed shadow-sm',
                highlight ? 'bg-blue-50/50 border-blue-100 text-gray-800' : 'bg-white border-gray-200 text-gray-700'
            ]">{{ content }}</pre>
        </div>
    `
};
