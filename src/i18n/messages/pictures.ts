// Pictures as the story goes: the card under a reply, the reader's Pictures
// switch and Settings -> Pictures.
// Each entry: [Simplified Chinese, Traditional Chinese, Japanese, Korean].
import type { Messages } from './types';

export const pictures: Messages = {
  Item: ['物品', '物品', 'アイテム', '아이템'],
  'Made automatically': ['自动生成', '自動產生', '自動で作成', '자동으로 만듦'],
  'Make a portrait of {name}?': [
    '为{name}生成一张肖像吗？',
    '為{name}產生一張肖像嗎？',
    '{name}の肖像画を作りますか？',
    '{name}의 초상화를 만들까요?',
  ],
  'Make a picture of {name}, where the story is now?': [
    '为故事现在所在的{name}生成一张图片吗？',
    '為故事現在所在的{name}產生一張圖片嗎？',
    '物語のいまの場所、{name}の画像を作りますか？',
    '지금 이야기가 펼쳐지는 곳, {name}의 이미지을 만들까요?',
  ],
  'Make a picture of {name}, which you carry?': [
    '为你携带的{name}生成一张图片吗？',
    '為你攜帶的{name}產生一張圖片嗎？',
    '持っている{name}の画像を作りますか？',
    '가지고 있는 {name}의 이미지을 만들까요?',
  ],
  'Pictures for this moment': ['此刻的图片', '此刻的圖片', 'この場面の画像', '이 장면의 이미지'],
  'From your images': ['来自你的图片', '來自你的圖片', 'あなたの画像から', '내 이미지에서'],
  'Making {name}…': ['正在生成{name}…', '正在產生{name}…', '{name}を作成中…', '{name} 만드는 중…'],
  'Make it': ['生成', '產生', '作る', '만들기'],
  'Not this one': ['这张不要', '這張不要', 'これはいらない', '이건 괜찮아요'],
  'No pictures in this story': [
    '这个故事不要图片',
    '這個故事不要圖片',
    'この物語では作らない',
    '이 이야기에서는 이미지 없이',
  ],
  'Change in Pictures': [
    '在“图片”中更改',
    '在「圖片」中更改',
    '「画像」で変更',
    '이미지에서 바꾸기',
  ],
  'Pictures as the story goes in this story': [
    '在这个故事中随剧情生成图片',
    '在這個故事中隨劇情產生圖片',
    'この物語で、話の流れに合わせて画像を用意する',
    '이 이야기에서 흐름에 맞춰 이미지 준비하기',
  ],
  'A card under a reply offers a picture of someone or somewhere new.': [
    '回复下方会出现卡片，询问是否为新出现的人物或地点生成图片。',
    '回覆下方會出現卡片，詢問是否為新出現的人物或地點產生圖片。',
    '新しい人物や場所が出てくると、返答の下のカードで画像を作るか尋ねます。',
    '새로운 인물이나 장소가 나오면 답글 아래 카드에서 이미지을 만들지 물어봅니다.',
  ],
  'Pictures of someone or somewhere new are made on their own.': [
    '新出现的人物或地点会自动生成图片。',
    '新出現的人物或地點會自動產生圖片。',
    '新しい人物や場所の画像は自動で作られます。',
    '새로운 인물이나 장소의 이미지은 자동으로 만들어집니다.',
  ],
  'Limits and kinds are in Settings → Pictures.': [
    '数量上限和种类在“设置 → 图片”中。',
    '數量上限和種類在「設定 → 圖片」中。',
    '上限と種類は「設定 → 画像」にあります。',
    '한도와 종류는 설정 → 이미지에 있습니다.',
  ],
  '{name} is ready {time}': [
    '{name}已就绪 {time}',
    '{name}已就緒 {time}',
    '{name}の準備ができました {time}',
    '{name} 준비됨 {time}',
  ],
  '{name} is in your images; choose it under Pictures.': [
    '{name}已在你的图片中；可在“图片”中选择它。',
    '{name}已在你的圖片中；可在「圖片」中選擇它。',
    '{name}は画像に入っています。「画像」で選んでください。',
    '{name}은(는) 내 이미지에 있습니다. 이미지에서 고르세요.',
  ],
  '{name} wasn’t made: {reason}': [
    '{name}没有生成：{reason}',
    '{name}沒有產生：{reason}',
    '{name}は作成されませんでした：{reason}',
    '{name}을(를) 만들지 못했습니다: {reason}',
  ],
  'Pictures change only when you choose them.': [
    '只有你自己选择时图片才会变化。',
    '只有你自己選擇時圖片才會變化。',
    '画像は自分で選んだときだけ変わります。',
    '이미지은 직접 고를 때만 바뀝니다.',
  ],
  'Ask me first': ['先问我', '先問我', '先に確認する', '먼저 물어보기'],
  'A card under the reply offers each picture; nothing is made until you say so.': [
    '回复下方的卡片会逐一询问；你同意之前不会生成任何图片。',
    '回覆下方的卡片會逐一詢問；你同意之前不會產生任何圖片。',
    '返答の下のカードで一枚ずつ尋ねます。了承するまで何も作りません。',
    '답글 아래 카드에서 하나씩 물어봅니다. 동의하기 전에는 아무것도 만들지 않습니다.',
  ],
  'Make them on their own': ['自动生成', '自動產生', '自動で作る', '자동으로 만들기'],
  'Pictures are made and put in place as the story goes, within the limits below.': [
    '在下方的限制内，随剧情自动生成图片并放到对应位置。',
    '在下方的限制內，隨劇情自動產生圖片並放到對應位置。',
    '下の上限の範囲で、話の流れに合わせて画像を作り、表示します。',
    '아래 한도 안에서 이야기 흐름에 맞춰 이미지을 만들고 바로 보여 줍니다.',
  ],
  'No limit': ['不限', '不限', '上限なし', '제한 없음'],
  'Any reply': ['每条回复', '每則回覆', '返答ごと', '답글마다'],
  'Every {count} replies': [
    '每 {count} 条回复',
    '每 {count} 則回覆',
    '{count} 返答ごと',
    '답글 {count}개마다',
  ],
  'Pictures as the story goes': [
    '随剧情生成图片',
    '隨劇情產生圖片',
    '話の流れに合わせた画像',
    '흐름에 맞춘 이미지',
  ],
  'When a reply brings in someone with no portrait, moves the story to a new place, or gives you an item, the story can show a picture of it with that reply. A matching picture from your images is used first; otherwise the picture connection makes one.':
    [
      '当回复中出现没有肖像的人物、故事来到新地点，或你得到一件物品时，故事可以在那条回复旁展示对应的图片。会先使用你图片中相符的图片；没有的话再由图片连接生成。',
      '當回覆中出現沒有肖像的人物、故事來到新地點，或你得到一件物品時，故事可以在那則回覆旁展示對應的圖片。會先使用你圖片中相符的圖片；沒有的話再由圖片連線產生。',
      '返答で肖像画のない人物が登場したり、新しい場所に移ったり、アイテムを手に入れたりすると、その返答と一緒に画像を表示できます。まず画像の中から合うものを使い、なければ画像用の接続で作ります。',
      '답글에 초상화가 없는 인물이 나오거나, 이야기가 새 장소로 옮겨 가거나, 아이템을 얻으면 그 답글과 함께 이미지을 보여 줄 수 있습니다. 내 이미지에서 맞는 이미지을 먼저 쓰고, 없으면 이미지 연결로 만듭니다.',
    ],
  'With no picture connection chosen, only pictures already in your images are used.': [
    '尚未选择图片连接，只会使用你图片中已有的图片。',
    '尚未選擇圖片連線，只會使用你圖片中已有的圖片。',
    '画像用の接続が選ばれていないため、すでにある画像だけを使います。',
    '이미지 연결을 고르지 않아 내 이미지에 이미 있는 이미지만 씁니다.',
  ],
  'Pictures of': ['图片内容', '圖片內容', '画像にするもの', '이미지으로 만들 것'],
  'People in the scene with no portrait': [
    '场景中没有肖像的人物',
    '場景中沒有肖像的人物',
    '場面にいる肖像画のない人物',
    '장면에 있는 초상화 없는 인물',
  ],
  'Places the story moves to': [
    '故事来到的地点',
    '故事來到的地點',
    '物語が移った場所',
    '이야기가 옮겨 간 장소',
  ],
  'Items you are given': ['你得到的物品', '你得到的物品', '手に入れたアイテム', '얻은 아이템'],
  'At most per story': ['每个故事最多', '每個故事最多', '1つの物語で最大', '이야기당 최대'],
  'At most per day': ['每天最多', '每天最多', '1日に最大', '하루 최대'],
  'How often': ['频率', '頻率', '頻度', '빈도'],
  'Only made pictures count toward the limits; pictures found in your images are free. Each person, place or item is offered once per story.':
    [
      '只有新生成的图片计入上限；从你的图片中找到的不计。每个人物、地点或物品在一个故事中只会询问一次。',
      '只有新產生的圖片計入上限；從你的圖片中找到的不計。每個人物、地點或物品在一個故事中只會詢問一次。',
      '上限に数えるのは新しく作った画像だけで、画像から見つけたものは数えません。人物・場所・アイテムは1つの物語でそれぞれ一度だけ提案します。',
      '새로 만든 이미지만 한도에 들어가고, 내 이미지에서 찾은 이미지은 들어가지 않습니다. 인물, 장소, 아이템마다 이야기당 한 번만 제안합니다.',
    ],
  'Made today: {count}': [
    '今天已生成：{count}',
    '今天已產生：{count}',
    '今日作成した数：{count}',
    '오늘 만든 수: {count}',
  ],
  'Use a matching picture from your images first': [
    '优先使用你图片中相符的图片',
    '優先使用你圖片中相符的圖片',
    'まず画像の中から合う画像を使う',
    '내 이미지에서 맞는 이미지을 먼저 쓰기',
  ],
  'Keep made pictures for every story': [
    '生成的图片供所有故事使用',
    '產生的圖片供所有故事使用',
    '作った画像をすべての物語で使えるようにする',
    '만든 이미지을 모든 이야기에서 쓰기',
  ],
  'So other stories can use them again. Off: each stays with the story it was made for, and can be shared later in Images.':
    [
      '这样其他故事也能再次使用。关闭时：每张图片只属于生成它的故事，之后可在“图片”中共享。',
      '這樣其他故事也能再次使用。關閉時：每張圖片只屬於產生它的故事，之後可在「圖片」中分享。',
      '他の物語でも使い回せます。オフにすると、作った物語だけのものになり、あとで「画像」から共有できます。',
      '다른 이야기에서도 다시 쓸 수 있습니다. 끄면 만든 이야기에만 남고, 나중에 이미지에서 공유할 수 있습니다.',
    ],
};
