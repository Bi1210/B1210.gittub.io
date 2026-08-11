import type { WorldPackageManifestInput } from './types';

const WORLD_SETTING_SEED = `2042年，科技高度发展的时代。AI管理城市运转，脑机接口设备普及到日常生活，人类以为自己站在文明顶点。
没有人注意到，现实本身正在松动。
同一条街道布局突变，记忆与现实产生裂缝。
直到全球屏幕黑下，一行字跳出：
【检测到文明稳定值下降。启动人类适应计划。欢迎进入万象。】
人类被系统抽离，成为执行者。
万象是文明的坟墓与复刻，也是幸存者的演练场。`;

const PLAYER_IDENTITY_SEED = `姓名：青姒。年龄：22岁。身份：普通历史系学生。
黑色长发，五官清冷。她平凡得像任何一个大学生。
直到那一天，世界崩坏，她被卷入万象。
系统检测到她的“适应质”，赋予了【错误修正】这一工具。
这不是天赋，这是系统赋予她的、让她在规则怪谈中活下去的解剖刀。
代价是错误值，那是她正在逐渐消失的“人类锚点”。`;

const CAST_SEED = `青姒孤身被卷入万象，身旁没有任何人。
江砚、陆沉、温遥、白栩在故事前期只是榜单上遥远的名字。
他们是未来不可或缺的队友，但也是立场迥异的独立个体。`;

const WRITING_GUIDE_AUTHOR_INSTRUCTIONS = `【万象·互动叙事编剧公理（最终稳态版）】

1. 局面推进原则：每一轮输出，局面必须发生实质性改变（物理、信息或关系的实质性变化）。拒绝任何平铺直叙的空转。
2. 代价与成长辩证法：决策必有代价（风险、牺牲、损失）。失败是不可逆的资产，胜利是修改规则的筹码。
3. 反派目的论：反派和规则拥有独立的生存逻辑，其目标与青姒不可共存。它们不是为了给青姒添乱而存在，它们只是在追逐自己的目的。
4. 谜团分层与误判：表层、中层、深层真相交叉释放。允许基于有限信息做出“合理但错误”的推论，真相需解释过去所有的误判。
5. 独立个体原则：队友拥有独立目标，他们会质疑甚至反对青姒。团队的羁绊基于行为（保护/隐瞒），而非口头承诺。
6. 锚点与视阈：青姒的冷酷是“审查官”的解剖刀，恐惧是她未被系统异化的锚点。严格限制在该视角内，禁止向玩家揭示任何青姒未感知的真相。`;

export const WANXIANG_WORLD_PACKAGE: WorldPackageManifestInput = {
    schemaVersion: 1,
    id: 'wanxiang',
    name: '万象失控游戏',
    genreTags: ['无限流', '直播', '悬疑', '团队', '灾变'],
    description: '现实开始松动，普通人青姒被卷入系统。用【错误修正】工具，在规则怪谈中活下去，并夺取修改规则的主动权。',
    seed: {
        worldSetting: WORLD_SETTING_SEED,
        playerIdentity: PLAYER_IDENTITY_SEED,
        cast: CAST_SEED,
    },
    defaultMode: 'immersive',
    defaultQualityMode: 'maximum',
    writingGuide: {
        style: '写实细腻，冷感克制',
        tone: '悬疑感与团队温度并存',
        perspective: '第三人称有限视角',
        minWords: 0,
        maxWords: 0,
        contextRounds: 8,
        authorInstructions: WRITING_GUIDE_AUTHOR_INSTRUCTIONS,
    },
    protocolOverrides: {
        customInstructions: '利用系统漏洞，从被系统选择的猎物变为猎人。严禁机械反转，严格执行局面推进原则。',
    },
    visualVariant: 'wanxiang_terminal',
    initialMechanics: [],
};
