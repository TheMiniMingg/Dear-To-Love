// Settings: language, storyteller, pictures and AI connections.
// Each entry: [Simplified Chinese, Traditional Chinese, Japanese, Korean].
import type { Messages } from './types';

export const settings: Messages = {
  Language: ['语言', '語言', '言語', '언어'],
  'App language': ['应用语言', '應用程式語言', 'アプリの言語', '앱 언어'],
  'Same as this computer ({language})': [
    '与这台电脑相同（{language}）',
    '與這台電腦相同（{language}）',
    'このコンピューターと同じ（{language}）',
    '이 컴퓨터와 같게({language})',
  ],
  "The language of menus, buttons and messages. A story is written in the language set in its own style, so you can play in one language with the app in another. Story presets and templates are in English; the storyteller still writes in the story's language.":
    [
      '菜单、按钮和提示信息所用的语言。故事使用它自己风格设置中的语言来写，所以你可以让应用显示一种语言，而用另一种语言游玩。故事预设和模板是英文的；讲述者仍会用故事的语言来写。',
      '選單、按鈕和提示訊息所用的語言。故事使用它自己風格設定中的語言來寫，所以你可以讓應用程式顯示一種語言，而用另一種語言遊玩。故事預設和範本是英文的；講述者仍會用故事的語言來寫。',
      'メニュー、ボタン、メッセージの言語です。ストーリーはそれぞれのスタイルで設定した言語で書かれるので、アプリとは別の言語で遊べます。ストーリーのプリセットとテンプレートは英語ですが、語り手はストーリーの言語で書きます。',
      '메뉴, 버튼, 메시지의 언어입니다. 스토리는 각 스토리의 스타일에서 정한 언어로 쓰이므로, 앱과 다른 언어로 즐길 수 있습니다. 스토리 프리셋과 템플릿은 영어지만, 이야기꾼은 스토리의 언어로 씁니다.',
    ],

  // Storyteller
  'Sending a one-line test message…': [
    '正在发送一行测试消息…',
    '正在傳送一行測試訊息…',
    '1 行のテストメッセージを送信中…',
    '한 줄짜리 테스트 메시지를 보내는 중…',
  ],
  'The model replied: “{reply}”': [
    '模型回复：“{reply}”',
    '模型回覆：「{reply}」',
    'モデルの返答：「{reply}」',
    '모델의 답: "{reply}"',
  ],
  Storyteller: ['讲述者', '講述者', '語り手', '이야기꾼'],
  "Who writes the replies in your stories. A story can pick its own storyteller instead (click the storyteller's name above the story). Changing it only affects new replies; what is already written stays as it is.":
    [
      '谁来撰写你故事中的回复。每个故事也可以选择自己的讲述者（点击故事上方的讲述者名称）。更改只影响新的回复；已经写好的内容保持不变。',
      '誰來撰寫你故事中的回覆。每個故事也可以選擇自己的講述者（點按故事上方的講述者名稱）。更改只影響新的回覆；已經寫好的內容保持不變。',
      'ストーリーの返信を書く役です。ストーリーごとに語り手を選ぶこともできます（ストーリー上部の語り手の名前をクリック）。変更は新しい返信にだけ効き、すでに書かれた内容はそのままです。',
      '스토리의 답장을 쓰는 역할입니다. 스토리마다 따로 이야기꾼을 고를 수도 있습니다(스토리 위쪽의 이야기꾼 이름을 클릭). 바꾸면 새 답장에만 적용되고, 이미 쓴 내용은 그대로입니다.',
    ],
  'Offline storyteller': ['离线讲述者', '離線講述者', 'オフラインの語り手', '오프라인 이야기꾼'],
  'local, no API charges': [
    '本地，无 API 费用',
    '本機，無 API 費用',
    'ローカル、API 料金なし',
    '로컬, API 요금 없음',
  ],
  'paid API': ['付费 API', '付費 API', '有料 API', '유료 API'],
  Pictures: ['图片', '圖片', '画像', '이미지'],
  "Makes a character's portrait from their description, when you choose a portrait while creating or reading a story. Portraits are always asked for as safe-for-work pictures.":
    [
      '在创建或阅读故事时选择肖像，就会根据角色描述生成肖像。肖像总是以适合工作场合（SFW）的图片来请求。',
      '在建立或閱讀故事時選擇肖像，就會根據角色描述產生肖像。肖像總是以適合工作場合（SFW）的圖片來請求。',
      'ストーリーの作成中や閲覧中に肖像画を選ぶと、キャラクターの説明から肖像画を作ります。肖像画は常に職場でも安全な（SFW）画像として依頼します。',
      '스토리를 만들거나 읽는 중에 초상화를 고르면 캐릭터 설명으로 초상화를 만듭니다. 초상화는 항상 건전한(SFW) 이미지로 요청합니다.',
    ],
  "Don't make pictures": ['不生成图片', '不產生圖片', '画像を作らない', '이미지 만들지 않기'],
  'Use only pictures you add yourself.': [
    '只使用你自己添加的图片。',
    '只使用你自己加入的圖片。',
    '自分で追加した画像だけを使います。',
    '직접 추가한 이미지만 씁니다.',
  ],
  'paid per picture': ['按张付费', '按張付費', '画像ごとに有料', '이미지당 유료'],
  'To make portraits, add a picture connection (OpenAI images, or Stable Diffusion WebUI on this computer) under AI connections.':
    [
      '要生成肖像，请在“AI 连接”中添加一个图片连接（OpenAI 图像，或这台电脑上的 Stable Diffusion WebUI）。',
      '要產生肖像，請在「AI 連線」中加入一個圖片連線（OpenAI 圖像，或這台電腦上的 Stable Diffusion WebUI）。',
      '肖像画を作るには、「AI 接続」で画像用の接続（OpenAI の画像、またはこのコンピューターの Stable Diffusion WebUI）を追加してください。',
      '초상화를 만들려면 "AI 연결"에서 이미지 연결(OpenAI 이미지 또는 이 컴퓨터의 Stable Diffusion WebUI)을 추가하세요.',
    ],
  'AI connections': ['AI 连接', 'AI 連線', 'AI 接続', 'AI 연결'],
  'Add connection': ['添加连接', '加入連線', '接続を追加', '연결 추가'],
  'No connections yet. Add one to play with an AI model from a cloud service or one running on this computer.':
    [
      '还没有连接。添加一个，就能使用云服务或这台电脑上运行的 AI 模型来游玩。',
      '還沒有連線。加入一個，就能使用雲端服務或這台電腦上執行的 AI 模型來遊玩。',
      'まだ接続はありません。追加すると、クラウドサービスやこのコンピューターで動く AI モデルで遊べます。',
      '아직 연결이 없습니다. 하나 추가하면 클라우드 서비스나 이 컴퓨터에서 돌아가는 AI 모델로 즐길 수 있습니다.',
    ],
  'key saved': ['已保存密钥', '已儲存金鑰', 'キー保存済み', '키 저장됨'],
  'no key needed': ['无需密钥', '無需金鑰', 'キー不要', '키 필요 없음'],
  'no key': ['没有密钥', '沒有金鑰', 'キーなし', '키 없음'],
  'Checks the address and key by listing models. Free, sends no story text.': [
    '通过列出模型来检查地址和密钥。免费，不发送任何故事文本。',
    '透過列出模型來檢查位址和金鑰。免費，不傳送任何故事文字。',
    'モデルの一覧を取得して、アドレスとキーを確かめます。無料で、ストーリーの本文は送りません。',
    '모델 목록을 받아 주소와 키를 확인합니다. 무료이며 스토리 본문은 보내지 않습니다.',
  ],
  'Test connection': ['测试连接', '測試連線', '接続をテスト', '연결 테스트'],
  'Sends one short message to the model. Paid services may charge a tiny amount.': [
    '向模型发送一条简短消息。付费服务可能会收取极少的费用。',
    '向模型傳送一則簡短訊息。付費服務可能會收取極少的費用。',
    'モデルに短いメッセージを 1 つ送ります。有料サービスではごくわずかな料金がかかることがあります。',
    '모델에 짧은 메시지 하나를 보냅니다. 유료 서비스는 아주 적은 요금이 들 수 있습니다.',
  ],
  'Send test message': [
    '发送测试消息',
    '傳送測試訊息',
    'テストメッセージを送信',
    '테스트 메시지 보내기',
  ],
  Edit: ['编辑', '編輯', '編集', '편집'],
  "Usage and cost estimates are recorded for every request to a paid service. Set a spending limit in your provider's own dashboard too; this app cannot see your balance.":
    [
      '每次向付费服务发出的请求都会记录用量和费用估算。也请在服务商自己的控制台里设置消费上限；本应用看不到你的余额。',
      '每次向付費服務發出的請求都會記錄用量和費用估算。也請在服務商自己的控制台裡設定消費上限；本應用程式看不到你的餘額。',
      '有料サービスへのリクエストごとに、使用量と費用の見積もりを記録します。プロバイダーの管理画面でも利用上限を設定してください。このアプリから残高は見えません。',
      '유료 서비스로 보내는 요청마다 사용량과 비용 추정치를 기록합니다. 제공자의 대시보드에서도 지출 한도를 정하세요. 이 앱은 잔액을 볼 수 없습니다.',
    ],
  'Add AI connection': ['添加 AI 连接', '加入 AI 連線', 'AI 接続を追加', 'AI 연결 추가'],
  'Edit {name}': ['编辑 {name}', '編輯 {name}', '{name} を編集', '{name} 편집'],
  'Delete connection?': ['删除连接？', '刪除連線？', '接続を削除しますか？', '연결을 삭제할까요?'],
  '{name} and its saved key will be removed. Stories and their replies are not affected, and past usage records are kept.':
    [
      '{name}及其保存的密钥将被删除。故事和其中的回复不受影响，过去的用量记录也会保留。',
      '{name}及其儲存的金鑰將被刪除。故事和其中的回覆不受影響，過去的用量記錄也會保留。',
      '{name}と保存されたキーが削除されます。ストーリーとその返信には影響せず、過去の使用記録も残ります。',
      '{name}와(과) 저장된 키가 삭제됩니다. 스토리와 답장은 그대로이고, 지난 사용 기록도 남습니다.',
    ],
  'Keep it': ['保留', '保留', '残す', '유지'],
  'Delete connection': ['删除连接', '刪除連線', '接続を削除', '연결 삭제'],
  'Who writes the replies': ['谁来写回复', '誰來寫回覆', '返信を書くのは', '답장을 쓰는 이'],
  'Same as the app': ['与应用相同', '與應用程式相同', 'アプリと同じ', '앱과 같게'],
  'Whatever Settings uses; now {name}.': [
    '使用设置中选择的讲述者；目前是{name}。',
    '使用設定中選擇的講述者；目前是{name}。',
    '設定で選んだものを使います。今は{name}です。',
    '설정에서 고른 것을 씁니다. 지금은 {name}입니다.',
  ],
  'The connection this story used was removed. Pick another one.': [
    '这个故事使用的连接已被删除。请另选一个。',
    '這個故事使用的連線已被刪除。請另選一個。',
    'このストーリーで使っていた接続は削除されました。別のものを選んでください。',
    '이 스토리가 쓰던 연결이 삭제되었습니다. 다른 것을 고르세요.',
  ],
  'OpenAI-compatible': ['OpenAI 兼容', 'OpenAI 相容', 'OpenAI 互換', 'OpenAI 호환'],
  'Images API': ['图像 API', '圖像 API', '画像 API', '이미지 API'],

  // Connection form
  'Temperature, reply length, context limit and timeout must be numbers.': [
    '温度、回复长度、上下文上限和超时必须是数字。',
    '溫度、回覆長度、上下文上限和逾時必須是數字。',
    '温度、返信の長さ、コンテキスト上限、タイムアウトは数値で入力してください。',
    '온도, 답장 길이, 컨텍스트 한도, 시간 제한은 숫자여야 합니다.',
  ],
  Service: ['服务', '服務', 'サービス', '서비스'],
  'Big AI labs, hosted open models and models on your own computer all work. Anything with an OpenAI-compatible API works through Other.':
    [
      '大型 AI 实验室、托管的开放模型以及你自己电脑上的模型都可以使用。任何提供 OpenAI 兼容 API 的服务都可以通过“其他”使用。',
      '大型 AI 實驗室、託管的開放模型以及你自己電腦上的模型都可以使用。任何提供 OpenAI 相容 API 的服務都可以透過「其他」使用。',
      '大手 AI ラボ、ホスティングされたオープンモデル、自分のコンピューターのモデルのどれでも使えます。OpenAI 互換 API があれば「その他」から使えます。',
      '대형 AI 연구소, 호스팅된 오픈 모델, 내 컴퓨터의 모델 모두 쓸 수 있습니다. OpenAI 호환 API가 있으면 "기타"로 연결됩니다.',
    ],
  Type: ['类型', '類型', '種類', '종류'],
  'OpenAI-compatible API': [
    'OpenAI 兼容 API',
    'OpenAI 相容 API',
    'OpenAI 互換 API',
    'OpenAI 호환 API',
  ],
  'Anthropic (Claude) API': [
    'Anthropic（Claude）API',
    'Anthropic（Claude）API',
    'Anthropic（Claude）API',
    'Anthropic(Claude) API',
  ],
  'Images API, OpenAI-style (pictures)': [
    '图像 API，OpenAI 风格（图片）',
    '圖像 API，OpenAI 風格（圖片）',
    '画像 API、OpenAI 形式（画像）',
    '이미지 API, OpenAI 방식(이미지)',
  ],
  'Stable Diffusion WebUI (pictures)': [
    'Stable Diffusion WebUI（图片）',
    'Stable Diffusion WebUI（圖片）',
    'Stable Diffusion WebUI（画像）',
    'Stable Diffusion WebUI(이미지)',
  ],
  "Uses Anthropic's own Messages API. Claude picks its own temperature, so that setting is not sent. Some Claude models think before they write, so leave room in the reply length.":
    [
      '使用 Anthropic 自己的 Messages API。Claude 会自行决定温度，因此不会发送该设置。有些 Claude 模型会先思考再写，所以请在回复长度上留出余量。',
      '使用 Anthropic 自己的 Messages API。Claude 會自行決定溫度，因此不會傳送該設定。有些 Claude 模型會先思考再寫，所以請在回覆長度上留出餘裕。',
      'Anthropic 独自の Messages API を使います。Claude は温度を自分で決めるため、その設定は送りません。書く前に考える Claude モデルもあるので、返信の長さには余裕を持たせてください。',
      'Anthropic 자체 Messages API를 씁니다. Claude는 온도를 스스로 정하므로 그 설정은 보내지 않습니다. 쓰기 전에 생각하는 Claude 모델도 있으니 답장 길이에 여유를 두세요.',
    ],
  "Uses Ollama's own API so each request asks for the context limit below. Install a model first, for example with {command}.":
    [
      '使用 Ollama 自己的 API，以便每次请求都按下方的上下文上限来要求。请先安装模型，例如用 {command}。',
      '使用 Ollama 自己的 API，以便每次請求都按下方的上下文上限來要求。請先安裝模型，例如用 {command}。',
      'Ollama 独自の API を使い、リクエストごとに下のコンテキスト上限を指定します。先にモデルをインストールしてください（例：{command}）。',
      'Ollama 자체 API를 써서 요청마다 아래의 컨텍스트 한도를 요구합니다. 먼저 모델을 설치하세요(예: {command}).',
    ],
  Name: ['名称', '名稱', '名前', '이름'],
  Address: ['地址', '位址', 'アドレス', '주소'],
  'For example {model}': ['例如 {model}', '例如 {model}', '例：{model}', '예: {model}'],
  'Model name, as the service spells it': [
    '模型名称，按服务的写法填写',
    '模型名稱，按服務的寫法填寫',
    'サービスでの表記どおりのモデル名',
    '서비스에서 쓰는 그대로의 모델 이름',
  ],
  "After saving, {test} checks the name against the service's list of models, for free.": [
    '保存后，{test}会免费对照服务的模型列表检查这个名称。',
    '儲存後，{test}會免費對照服務的模型清單檢查這個名稱。',
    '保存したあと、{test}でサービスのモデル一覧と名前を無料で照合できます。',
    '저장한 뒤 {test}로 서비스의 모델 목록과 이름을 무료로 대조합니다.',
  ],
  'API key': ['API 密钥', 'API 金鑰', 'API キー', 'API 키'],
  'Saved. Leave empty to keep it.': [
    '已保存。留空即保留。',
    '已儲存。留空即保留。',
    '保存済みです。空欄のままにすると保持します。',
    '저장되어 있습니다. 비워 두면 유지합니다.',
  ],
  'Not needed for local servers': [
    '本地服务器不需要',
    '本機伺服器不需要',
    'ローカルサーバーでは不要',
    '로컬 서버에는 필요 없음',
  ],
  'Paste your API key (not needed for local servers)': [
    '粘贴你的 API 密钥（本地服务器不需要）',
    '貼上你的 API 金鑰（本機伺服器不需要）',
    'API キーを貼り付け（ローカルサーバーでは不要）',
    'API 키를 붙여 넣으세요(로컬 서버에는 필요 없음)',
  ],
  'Remove the saved key': [
    '删除已保存的密钥',
    '刪除已儲存的金鑰',
    '保存したキーを削除',
    '저장된 키 삭제',
  ],
  "Stored in your system's credential store, never in the story database or exports.": [
    '保存在系统的凭据存储中，绝不会写入故事数据库或导出文件。',
    '保存在系統的憑證儲存區中，絕不會寫入故事資料庫或匯出檔案。',
    'システムの資格情報ストアに保存し、ストーリーのデータベースやエクスポートには入れません。',
    '시스템 자격 증명 저장소에 보관하며, 스토리 데이터베이스나 내보내기에는 절대 넣지 않습니다.',
  ],
  Charges: ['费用', '費用', '料金', '요금'],
  "Paid API (each picture is recorded; the app can't price pictures)": [
    '付费 API（每张图片都会记录；应用无法为图片计价）',
    '付費 API（每張圖片都會記錄；應用程式無法為圖片計價）',
    '有料 API（画像ごとに記録します。画像の料金は計算できません）',
    '유료 API(이미지마다 기록하지만 앱이 이미지 가격은 계산하지 못함)',
  ],
  'Paid API (usage is estimated from your rates)': [
    '付费 API（按你填写的价格估算用量）',
    '付費 API（按你填寫的價格估算用量）',
    '有料 API（入力した料金から使用量を見積もります）',
    '유료 API(입력한 가격으로 사용량 추정)',
  ],
  'Local model (no API charges)': [
    '本地模型（无 API 费用）',
    '本機模型（無 API 費用）',
    'ローカルモデル（API 料金なし）',
    '로컬 모델(API 요금 없음)',
  ],
  Advanced: ['高级', '進階', '詳細設定', '고급'],
  Temperature: ['温度', '溫度', '温度', '온도'],
  'Longest reply (tokens)': [
    '最长回复（token）',
    '最長回覆（token）',
    '返信の最大長（トークン）',
    '최대 답장 길이(토큰)',
  ],
  'Context limit (tokens)': [
    '上下文上限（token）',
    '上下文上限（token）',
    'コンテキスト上限（トークン）',
    '컨텍스트 한도(토큰)',
  ],
  'Give up after (seconds of silence)': [
    '无响应多久后放弃（秒）',
    '無回應多久後放棄（秒）',
    '応答がないとき諦めるまで（秒）',
    '응답이 없을 때 포기할 시간(초)',
  ],
  "The context limit covers the prompt and the reply. Use the model's context length, or the length your local server loads it with. Older story turns are summarized to fit; a lower limit also keeps paid requests cheaper.":
    [
      '上下文上限包括提示词和回复。请使用模型的上下文长度，或你的本地服务器加载模型时使用的长度。较早的故事回合会被摘要以便放得下；较低的上限也能让付费请求更便宜。',
      '上下文上限包括提示詞和回覆。請使用模型的上下文長度，或你的本機伺服器載入模型時使用的長度。較早的故事回合會被摘要以便放得下；較低的上限也能讓付費請求更便宜。',
      'コンテキスト上限はプロンプトと返信の合計です。モデルのコンテキスト長か、ローカルサーバーがモデルを読み込むときの長さを入れてください。古いターンは収まるように要約されます。上限を低くすると有料のリクエストも安くなります。',
      '컨텍스트 한도는 프롬프트와 답장을 합한 것입니다. 모델의 컨텍스트 길이나 로컬 서버가 모델을 불러올 때의 길이를 쓰세요. 오래된 턴은 들어가도록 요약됩니다. 한도를 낮추면 유료 요청도 저렴해집니다.',
    ],
  'Save changes': ['保存更改', '儲存變更', '変更を保存', '변경 사항 저장'],
  'Save connection': ['保存连接', '儲存連線', '接続を保存', '연결 저장'],

  // Connection presets
  'On this computer (free and private)': [
    '在这台电脑上（免费且私密）',
    '在這台電腦上（免費且私密）',
    'このコンピューター上（無料・プライベート）',
    '이 컴퓨터에서(무료, 비공개)',
  ],
  'AI labs (API key, paid per use)': [
    'AI 实验室（API 密钥，按用量付费）',
    'AI 實驗室（API 金鑰，按用量付費）',
    'AI ラボ（API キー、従量課金）',
    'AI 연구소(API 키, 사용량 과금)',
  ],
  'Open models, hosted (API key)': [
    '托管的开放模型（API 密钥）',
    '託管的開放模型（API 金鑰）',
    'ホスティングされたオープンモデル（API キー）',
    '호스팅된 오픈 모델(API 키)',
  ],
  'Anything else': ['其他', '其他', 'その他', '기타'],
  "Load a model and start the server in LM Studio's Developer tab.": [
    '在 LM Studio 的“开发者”标签页中加载模型并启动服务器。',
    '在 LM Studio 的「開發者」分頁中載入模型並啟動伺服器。',
    'LM Studio の Developer タブでモデルを読み込み、サーバーを起動してください。',
    'LM Studio의 Developer 탭에서 모델을 불러오고 서버를 시작하세요.',
  ],
  'Start it with llama-server -m your-model.gguf. Any model name works.': [
    '用 llama-server -m your-model.gguf 启动。任何模型名称都可以。',
    '用 llama-server -m your-model.gguf 啟動。任何模型名稱都可以。',
    'llama-server -m your-model.gguf で起動してください。モデル名は何でもかまいません。',
    'llama-server -m your-model.gguf로 시작하세요. 모델 이름은 무엇이든 됩니다.',
  ],
  'Start KoboldCpp with a model loaded. Any model name works.': [
    '加载模型后启动 KoboldCpp。任何模型名称都可以。',
    '載入模型後啟動 KoboldCpp。任何模型名稱都可以。',
    'モデルを読み込んで KoboldCpp を起動してください。モデル名は何でもかまいません。',
    '모델을 불러온 채로 KoboldCpp를 시작하세요. 모델 이름은 무엇이든 됩니다.',
  ],
  "Turn on Jan's Local API Server first.": [
    '请先开启 Jan 的 Local API Server。',
    '請先開啟 Jan 的 Local API Server。',
    '先に Jan の Local API Server をオンにしてください。',
    '먼저 Jan의 Local API Server를 켜세요.',
  ],
  'Start it with the --api flag and load a model.': [
    '用 --api 参数启动并加载模型。',
    '用 --api 參數啟動並載入模型。',
    '--api フラグを付けて起動し、モデルを読み込んでください。',
    '--api 옵션으로 시작하고 모델을 불러오세요.',
  ],
  'Use the model name you served, as vllm serve was given it.': [
    '使用你提供服务的模型名称，即传给 vllm serve 的名称。',
    '使用你提供服務的模型名稱，即傳給 vllm serve 的名稱。',
    'vllm serve に渡したとおりの、提供中のモデル名を使ってください。',
    'vllm serve에 넘긴 그대로, 제공 중인 모델 이름을 쓰세요.',
  ],
  'Create a key at platform.openai.com.': [
    '在 platform.openai.com 创建密钥。',
    '在 platform.openai.com 建立金鑰。',
    'platform.openai.com でキーを作成してください。',
    'platform.openai.com에서 키를 만드세요.',
  ],
  'Create a key at platform.claude.com. Uses Anthropic’s own API.': [
    '在 platform.claude.com 创建密钥。使用 Anthropic 自己的 API。',
    '在 platform.claude.com 建立金鑰。使用 Anthropic 自己的 API。',
    'platform.claude.com でキーを作成してください。Anthropic 独自の API を使います。',
    'platform.claude.com에서 키를 만드세요. Anthropic 자체 API를 씁니다.',
  ],
  'Create a key in Google AI Studio (aistudio.google.com).': [
    '在 Google AI Studio（aistudio.google.com）创建密钥。',
    '在 Google AI Studio（aistudio.google.com）建立金鑰。',
    'Google AI Studio（aistudio.google.com）でキーを作成してください。',
    'Google AI Studio(aistudio.google.com)에서 키를 만드세요.',
  ],
  'Create a key at console.x.ai.': [
    '在 console.x.ai 创建密钥。',
    '在 console.x.ai 建立金鑰。',
    'console.x.ai でキーを作成してください。',
    'console.x.ai에서 키를 만드세요.',
  ],
  'Create a key at console.mistral.ai.': [
    '在 console.mistral.ai 创建密钥。',
    '在 console.mistral.ai 建立金鑰。',
    'console.mistral.ai でキーを作成してください。',
    'console.mistral.ai에서 키를 만드세요.',
  ],
  'Create a key at platform.deepseek.com.': [
    '在 platform.deepseek.com 创建密钥。',
    '在 platform.deepseek.com 建立金鑰。',
    'platform.deepseek.com でキーを作成してください。',
    'platform.deepseek.com에서 키를 만드세요.',
  ],
  'One key reaches hundreds of models, open and closed, with different content rules.': [
    '一个密钥即可使用数百个开放和闭源模型，各自的内容规则不同。',
    '一個金鑰即可使用數百個開放和封閉模型，各自的內容規則不同。',
    'ひとつのキーで、コンテンツの規則が異なる数百のオープン・クローズドなモデルを使えます。',
    '키 하나로 콘텐츠 규칙이 저마다 다른 오픈·클로즈드 모델 수백 개를 쓸 수 있습니다.',
  ],
  'Use a Hugging Face access token as the key.': [
    '把 Hugging Face 访问令牌作为密钥。',
    '把 Hugging Face 存取權杖作為金鑰。',
    'Hugging Face のアクセストークンをキーとして使ってください。',
    'Hugging Face 액세스 토큰을 키로 쓰세요.',
  ],
  'Makes portraits on this computer, for free. Start the WebUI with --api. The model "default" uses whichever one it has loaded.':
    [
      '在这台电脑上免费生成肖像。用 --api 启动 WebUI。模型填“default”即使用它当前加载的模型。',
      '在這台電腦上免費產生肖像。用 --api 啟動 WebUI。模型填「default」即使用它目前載入的模型。',
      'このコンピューターで無料で肖像画を作ります。WebUI を --api 付きで起動してください。モデル名「default」で、読み込み中のモデルを使います。',
      '이 컴퓨터에서 무료로 초상화를 만듭니다. WebUI를 --api로 시작하세요. 모델을 "default"로 두면 불러온 모델을 씁니다.',
    ],
  'Other (enter the address)': [
    '其他（输入地址）',
    '其他（輸入位址）',
    'その他（アドレスを入力）',
    '기타(주소 입력)',
  ],
  'Any service or server with an OpenAI-compatible chat completions API works.': [
    '任何提供 OpenAI 兼容 chat completions API 的服务或服务器都可以。',
    '任何提供 OpenAI 相容 chat completions API 的服務或伺服器都可以。',
    'OpenAI 互換の chat completions API を持つサービスやサーバーなら使えます。',
    'OpenAI 호환 chat completions API가 있는 서비스나 서버라면 됩니다.',
  ],
  'A little': ['少一些', '少一些', '少し', '조금'],
  Some: ['适中', '適中', 'ほどほど', '적당히'],
  'A lot': ['多一些', '多一些', 'たくさん', '많이'],
  'The app background (Settings → Background picture). Deleting it removes it there.': [
    '应用背景（设置 → 背景图片）。删除它也会从那里移除。',
    '應用程式背景（設定 → 背景圖片）。刪除它也會從那裡移除。',
    'アプリの背景（設定 → 背景画像）。削除するとそこからも外れます。',
    '앱 배경(설정 → 배경 이미지). 삭제하면 거기서도 빠집니다.',
  ],
  'Background picture': ['背景图片', '背景圖片', '背景画像', '배경 이미지'],
  'A picture of your own behind every screen, softened so the text stays easy to read. It is a setting of this computer.':
    [
      '在每个界面后面显示你自己的图片，并做淡化处理，让文字依然清晰易读。这是这台电脑上的设置。',
      '在每個畫面後面顯示你自己的圖片，並做淡化處理，讓文字依然清楚易讀。這是這台電腦上的設定。',
      'すべての画面の後ろに自分の画像を表示します。文字が読みやすいように淡く表示されます。このコンピューターの設定です。',
      '모든 화면 뒤에 내 이미지를 보여 줍니다. 글자를 읽기 쉽도록 흐리게 표시됩니다. 이 컴퓨터의 설정입니다.',
    ],
  'The current background picture': [
    '当前的背景图片',
    '目前的背景圖片',
    '現在の背景画像',
    '현재 배경 이미지',
  ],
  'No background picture.': [
    '没有背景图片。',
    '沒有背景圖片。',
    '背景画像はありません。',
    '배경 이미지가 없습니다.',
  ],
  'Change picture…': ['更换图片…', '更換圖片…', '画像を変更…', '이미지 변경…'],
  'Choose a picture…': ['选择图片…', '選擇圖片…', '画像を選ぶ…', '이미지 선택…'],
  'How much of the picture shows': [
    '图片的显示程度',
    '圖片的顯示程度',
    '画像の見え方',
    '이미지가 보이는 정도',
  ],
  'Choose a background picture': [
    '选择背景图片',
    '選擇背景圖片',
    '背景画像を選ぶ',
    '배경 이미지 선택',
  ],
  'Pictures from your image library. A wide picture, such as a landscape, works best.': [
    '来自你的图片库的图片。横向的宽幅图片（例如风景）效果最好。',
    '來自你的圖片庫的圖片。橫向的寬幅圖片（例如風景）效果最好。',
    '画像ライブラリの画像です。風景のような横長の画像がいちばん合います。',
    '이미지 라이브러리의 이미지입니다. 풍경처럼 가로로 긴 이미지가 가장 잘 어울립니다.',
  ],
  'Add a picture from this computer…': [
    '从这台电脑添加图片…',
    '從這台電腦新增圖片…',
    'このコンピューターから画像を追加…',
    '이 컴퓨터에서 이미지 추가…',
  ],
  'Your image library is empty.': [
    '你的图片库是空的。',
    '你的圖片庫是空的。',
    '画像ライブラリは空です。',
    '이미지 라이브러리가 비어 있습니다.',
  ],
  'Pictures in your library': [
    '图片库中的图片',
    '圖片庫中的圖片',
    'ライブラリの画像',
    '라이브러리의 이미지',
  ],
  'Setup guide': ['设置指南', '設定指南', 'セットアップガイド', '설정 가이드'],
  'Play right away': ['马上开始玩', '馬上開始玩', 'すぐに遊ぶ', '바로 플레이하기'],
  'Choose where replies come from': [
    '选择回复的来源',
    '選擇回覆的來源',
    '返答をどこで作るか選ぶ',
    '답변을 만들 곳 고르기',
  ],
  'Connect a service': ['连接一个服务', '連線一個服務', 'サービスに接続する', '서비스 연결하기'],
  'Test it and start playing': [
    '测试并开始玩',
    '測試並開始玩',
    'テストして遊び始める',
    '테스트하고 플레이 시작하기',
  ],
  'Keep costs in check': ['控制费用', '控制費用', '費用を抑える', '비용 관리하기'],
  'Your keys stay on this computer': [
    '你的密钥只保存在这台电脑上',
    '你的金鑰只儲存在這台電腦上',
    'キーはこのコンピューターだけに保存されます',
    '키는 이 컴퓨터에만 보관됩니다',
  ],
  'If something goes wrong': ['遇到问题时', '遇到問題時', 'うまくいかないとき', '문제가 생겼을 때'],
  'free, on this computer': [
    '免费，在这台电脑上运行',
    '免費，在這台電腦上執行',
    '無料、このコンピューターで動作',
    '무료, 이 컴퓨터에서 실행',
  ],
  'API key, paid per picture': [
    '需要 API 密钥，按张付费',
    '需要 API 金鑰，按張付費',
    'API キーが必要、画像ごとに有料',
    'API 키 필요, 이미지당 유료',
  ],
  'API key, paid per use': [
    '需要 API 密钥，按用量付费',
    '需要 API 金鑰，按用量付費',
    'API キーが必要、使った分だけ有料',
    'API 키 필요, 사용량만큼 유료',
  ],
  'Set it up here': ['在这里设置', '在這裡設定', 'ここで設定', '여기서 설정'],
  'You can play right away: the built-in offline storyteller needs nothing. To have an AI model write your stories, connect one of the services below. It takes a few minutes, and you can switch any time.':
    [
      '你现在就能开始玩：内置的离线讲述者无需任何设置。想让 AI 模型来写你的故事，就连接下面的某个服务。只需几分钟，之后随时可以更换。',
      '你現在就能開始玩：內建的離線講述者無需任何設定。想讓 AI 模型來寫你的故事，就連線下面的某個服務。只需幾分鐘，之後隨時可以更換。',
      'すぐに遊べます。内蔵のオフラインの語り手は何も準備がいりません。AI モデルにストーリーを書いてもらうには、下のサービスのどれかに接続してください。数分で済み、いつでも切り替えられます。',
      '지금 바로 플레이할 수 있습니다. 내장된 오프라인 이야기꾼은 아무 준비가 필요 없습니다. AI 모델이 스토리를 쓰게 하려면 아래 서비스 중 하나를 연결하세요. 몇 분이면 되고 언제든 바꿀 수 있습니다.',
    ],
  'On this page': ['本页内容', '本頁內容', 'このページの内容', '이 페이지의 내용'],
  'In the library, choose {newStory}, pick a story and choose {start}.': [
    '在书库中选择{newStory}，挑一个故事，然后选择{start}。',
    '在書庫中選擇{newStory}，挑一個故事，然後選擇{start}。',
    'ライブラリで{newStory}を選び、ストーリーを選んで{start}を押します。',
    '라이브러리에서 {newStory}를 선택하고 스토리를 고른 뒤 {start}을 누르세요.',
  ],
  'The offline storyteller writes the replies: simple ones, free and without internet. You can switch to an AI model later, even in the middle of a story.':
    [
      '回复由离线讲述者撰写：内容简单、免费，且不需要网络。之后可以随时换成 AI 模型，即使故事进行到一半也可以。',
      '回覆由離線講述者撰寫：內容簡單、免費，且不需要網路。之後可以隨時換成 AI 模型，即使故事進行到一半也可以。',
      '返答はオフラインの語り手が書きます。シンプルで、無料で、インターネットもいりません。あとから AI モデルに切り替えられ、ストーリーの途中でもかまいません。',
      '답변은 오프라인 이야기꾼이 씁니다. 간단하고, 무료이며, 인터넷이 필요 없습니다. 나중에 AI 모델로 바꿀 수 있고, 스토리 중간에도 됩니다.',
    ],
  'Nothing leaves your computer and nothing costs money. Small models run on most recent computers and write simpler stories; bigger ones write better but need a strong graphics card or a lot of memory.':
    [
      '所有内容都不会离开你的电脑，也不花钱。小模型能在大多数较新的电脑上运行，写出的故事较简单；大模型写得更好，但需要强劲的显卡或大量内存。',
      '所有內容都不會離開你的電腦，也不花錢。小模型能在大多數較新的電腦上執行，寫出的故事較簡單；大模型寫得更好，但需要強勁的顯示卡或大量記憶體。',
      'データはコンピューターの外に出ず、費用もかかりません。小さなモデルは最近のコンピューターならたいてい動き、シンプルなストーリーを書きます。大きなモデルほど上手に書きますが、高性能なグラフィックカードか大量のメモリが必要です。',
      '아무것도 컴퓨터 밖으로 나가지 않고 비용도 들지 않습니다. 작은 모델은 대부분의 최신 컴퓨터에서 실행되며 간단한 스토리를 씁니다. 큰 모델은 더 잘 쓰지만 강력한 그래픽 카드나 많은 메모리가 필요합니다.',
    ],
  'The strongest writers. You pay the company for each reply, usually a fraction of a cent to a few cents. Each company has its own rules on what stories it will write.':
    [
      '写作能力最强。每条回复都要向公司付费，通常不到一美分到几美分。每家公司对愿意写哪些故事都有自己的规则。',
      '寫作能力最強。每則回覆都要向公司付費，通常不到一美分到幾美分。每家公司對願意寫哪些故事都有自己的規則。',
      '最も文章が上手です。返答ごとに会社へ料金を払い、たいてい 1 セント未満から数セントです。どんなストーリーを書くかは会社ごとに独自のルールがあります。',
      '가장 글을 잘 씁니다. 답변마다 회사에 비용을 내며, 보통 1센트 미만에서 몇 센트입니다. 어떤 스토리를 쓸지는 회사마다 자체 규칙이 있습니다.',
    ],
  'Open models run for you by a service: often cheaper than the labs, with many models to choose from. Rules on content differ from model to model and service to service.':
    [
      '由服务商替你运行的开放模型：通常比 AI 实验室便宜，可选的模型也很多。内容规则因模型和服务而异。',
      '由服務商替你執行的開放模型：通常比 AI 實驗室便宜，可選的模型也很多。內容規則因模型和服務而異。',
      'サービスが代わりに動かしてくれるオープンモデルです。AI ラボより安いことが多く、選べるモデルもたくさんあります。内容のルールはモデルやサービスによって異なります。',
      '서비스가 대신 실행해 주는 오픈 모델입니다. AI 연구소보다 저렴한 경우가 많고, 고를 수 있는 모델도 많습니다. 콘텐츠 규칙은 모델과 서비스마다 다릅니다.',
    ],
  'Pick one and open it for its steps. Links open in your browser; Set it up here opens a new connection with the service filled in.':
    [
      '选一个并展开查看步骤。链接会在浏览器中打开；“在这里设置”会打开一个已填好该服务的新连接。',
      '選一個並展開查看步驟。連結會在瀏覽器中開啟；「在這裡設定」會開啟一個已填好該服務的新連線。',
      'どれかを選んで開くと手順が表示されます。リンクはブラウザーで開きます。「ここで設定」を押すと、そのサービスが入力済みの新しい接続が開きます。',
      '하나를 골라 펼치면 단계가 나옵니다. 링크는 브라우저에서 열립니다. ‘여기서 설정’을 누르면 그 서비스가 입력된 새 연결이 열립니다.',
    ],
  'Something else? Any service or program with an OpenAI-compatible API works: choose Add connection in Settings, then Other, and type its address.':
    [
      '其他服务？任何提供 OpenAI 兼容 API 的服务或程序都可以：在设置中选择“添加连接”，再选“其他”，然后输入它的地址。',
      '其他服務？任何提供 OpenAI 相容 API 的服務或程式都可以：在設定中選擇「加入連線」，再選「其他」，然後輸入它的位址。',
      'ほかのサービス？ OpenAI 互換 API を持つサービスやプログラムなら使えます。設定で「接続を追加」を選び、「その他」を選んでアドレスを入力してください。',
      '다른 서비스인가요? OpenAI 호환 API가 있는 서비스나 프로그램이면 됩니다. 설정에서 ‘연결 추가’를 누르고 ‘기타’를 고른 뒤 주소를 입력하세요.',
    ],
  'In Settings, under AI connections, {test} checks the address and key for free. {send} asks the model for one short reply.':
    [
      '在设置的“AI 连接”下，{test}会免费检查地址和密钥。{send}会请模型写一条简短的回复。',
      '在設定的「AI 連線」下，{test}會免費檢查位址和金鑰。{send}會請模型寫一則簡短的回覆。',
      '設定の「AI 接続」で、{test}を押すとアドレスとキーを無料で確認します。{send}はモデルに短い返答を 1 つ書いてもらいます。',
      '설정의 ‘AI 연결’에서 {test}는 주소와 키를 무료로 확인합니다. {send}는 모델에게 짧은 답변을 하나 요청합니다.',
    ],
  "Your first connection becomes the storyteller for every story. Settings → Storyteller changes it, and a story can have its own: click the storyteller's name above the story.":
    [
      '你的第一个连接会成为所有故事的讲述者。可以在“设置 → 讲述者”中更改；单个故事也可以有自己的讲述者：点击故事上方讲述者的名字即可。',
      '你的第一個連線會成為所有故事的講述者。可以在「設定 → 講述者」中更改；單個故事也可以有自己的講述者：點選故事上方講述者的名字即可。',
      '最初の接続がすべてのストーリーの語り手になります。「設定 → 語り手」で変更でき、ストーリーごとに別の語り手にもできます（ストーリーの上にある語り手の名前をクリック）。',
      '첫 번째 연결이 모든 스토리의 이야기꾼이 됩니다. ‘설정 → 이야기꾼’에서 바꿀 수 있고, 스토리마다 따로 정할 수도 있습니다. 스토리 위의 이야기꾼 이름을 클릭하세요.',
    ],
  'Programs on this computer often load a model with a short memory (4096 tokens). If replies forget the start of the story, raise the context size in the program and the context limit of the connection.':
    [
      '在这台电脑上运行的程序常以较短的记忆（4096 个 token）加载模型。如果回复忘了故事的开头，请在程序中调大上下文长度，并调高该连接的上下文上限。',
      '在這台電腦上執行的程式常以較短的記憶（4096 個 token）載入模型。如果回覆忘了故事的開頭，請在程式中調大上下文長度，並調高該連線的上下文上限。',
      'このコンピューターで動くプログラムは、短い記憶（4096 トークン）でモデルを読み込むことがよくあります。返答がストーリーの始まりを忘れるようなら、プログラムのコンテキストサイズと、接続のコンテキスト上限を上げてください。',
      '이 컴퓨터에서 실행되는 프로그램은 짧은 기억(4096토큰)으로 모델을 불러오는 경우가 많습니다. 답변이 스토리의 시작을 잊는다면 프로그램의 컨텍스트 크기와 연결의 컨텍스트 한도를 높이세요.',
    ],
  'Open Settings': ['打开设置', '開啟設定', '設定を開く', '설정 열기'],
  'Your first picture connection is put to use; Settings → Pictures chooses another, or none.': [
    '你的第一个图片连接会被自动使用；可以在“设置 → 图片”中改选其他连接，或不使用。',
    '你的第一個圖片連線會被自動使用；可以在「設定 → 圖片」中改選其他連線，或不使用。',
    '最初の画像の接続が使われます。「設定 → 画像」でほかの接続を選ぶことも、使わないこともできます。',
    '첫 번째 이미지 연결이 사용됩니다. ‘설정 → 이미지’에서 다른 연결을 고르거나 사용하지 않을 수 있습니다.',
  ],
  '{usage} estimates what each paid connection has cost, and can warn you or pause paid replies at a monthly limit you choose.':
    [
      '{usage}会估算每个付费连接的花费，并可在达到你设定的每月上限时提醒你或暂停付费回复。',
      '{usage}會估算每個付費連線的花費，並可在達到你設定的每月上限時提醒你或暫停付費回覆。',
      '{usage}では、有料の接続ごとにかかった費用を見積もり、決めた月の上限で警告したり有料の返答を止めたりできます。',
      '{usage}에서는 유료 연결마다 든 비용을 추정하고, 정한 월 한도에 이르면 알려 주거나 유료 답변을 멈출 수 있습니다.',
    ],
  "Set a spending limit on the service's own site too: the app can't see your balance.": [
    '也请在服务自己的网站上设置消费上限：本应用看不到你的余额。',
    '也請在服務自己的網站上設定消費上限：本應用程式看不到你的餘額。',
    'サービスのサイトでも利用上限を設定してください。このアプリには残高が見えません。',
    '서비스 사이트에서도 지출 한도를 정해 두세요. 이 앱은 잔액을 볼 수 없습니다.',
  ],
  "API keys are kept in your computer's own password store (Credential Manager on Windows, Keychain on a Mac, the Secret Service on Linux) and are only sent to the service they belong to. They are never put in stories, storypacks, backups, exports or diagnostics reports.":
    [
      'API 密钥保存在你电脑自带的密码存储中（Windows 的凭据管理器、Mac 的钥匙串、Linux 的 Secret Service），只会发送给它所属的服务。它们绝不会出现在故事、故事包、备份、导出文件或诊断报告中。',
      'API 金鑰儲存在你電腦內建的密碼儲存中（Windows 的認證管理員、Mac 的鑰匙圈、Linux 的 Secret Service），只會傳送給它所屬的服務。它們絕不會出現在故事、故事包、備份、匯出檔或診斷報告中。',
      'API キーはコンピューター自身のパスワード保管場所（Windows の資格情報マネージャー、Mac のキーチェーン、Linux の Secret Service）に保存され、そのキーのサービスにだけ送られます。ストーリー、ストーリーパック、バックアップ、書き出したファイル、診断レポートに入ることはありません。',
      'API 키는 컴퓨터 자체의 비밀번호 저장소(Windows 자격 증명 관리자, Mac 키체인, Linux Secret Service)에 보관되며 해당 서비스에만 전송됩니다. 스토리, 스토리팩, 백업, 내보낸 파일, 진단 보고서에는 절대 들어가지 않습니다.',
    ],
  'The key is wrong or was revoked. Edit the connection and paste a new one.': [
    '密钥有误或已被撤销。请编辑该连接并粘贴新的密钥。',
    '金鑰有誤或已被撤銷。請編輯該連線並貼上新的金鑰。',
    'キーが間違っているか、無効にされています。接続を編集して新しいキーを貼り付けてください。',
    '키가 잘못되었거나 취소되었습니다. 연결을 편집해 새 키를 붙여 넣으세요.',
  ],
  "Wait a minute and retry, or add credit on the service's site. New accounts often have low limits.":
    [
      '等一分钟后重试，或到服务的网站上充值。新账户的限额通常较低。',
      '等一分鐘後重試，或到服務的網站上儲值。新帳戶的限額通常較低。',
      '1 分ほど待ってからやり直すか、サービスのサイトでクレジットを追加してください。新しいアカウントは上限が低いことがよくあります。',
      '1분 정도 기다렸다가 다시 시도하거나 서비스 사이트에서 크레딧을 충전하세요. 새 계정은 한도가 낮은 경우가 많습니다.',
    ],
  'For a program on this computer, check that it is running and its server is on. Otherwise check your internet connection and the address.':
    [
      '如果是在这台电脑上运行的程序，请确认它正在运行且服务器已开启。否则请检查网络连接和地址。',
      '如果是在這台電腦上執行的程式，請確認它正在執行且伺服器已開啟。否則請檢查網路連線和位址。',
      'このコンピューターで動くプログラムなら、起動していてサーバーがオンになっているか確認してください。そうでなければ、インターネット接続とアドレスを確認してください。',
      '이 컴퓨터에서 실행되는 프로그램이라면 실행 중이고 서버가 켜져 있는지 확인하세요. 그렇지 않다면 인터넷 연결과 주소를 확인하세요.',
    ],
  "Often the model name: type it exactly as the service's model list shows it. The message under the reply says more.":
    [
      '常见原因是模型名称：请完全按照服务的模型列表输入。回复下方的消息会说明更多。',
      '常見原因是模型名稱：請完全依照服務的模型列表輸入。回覆下方的訊息會說明更多。',
      'よくある原因はモデル名です。サービスのモデル一覧のとおりに正確に入力してください。詳しくは返答の下のメッセージに出ます。',
      '모델 이름이 원인인 경우가 많습니다. 서비스의 모델 목록에 나온 그대로 입력하세요. 자세한 내용은 답변 아래 메시지에 나옵니다.',
    ],
  '{diagnostics} checks the app and your connections, and can make a report to share that leaves out keys and story text.':
    [
      '{diagnostics}会检查应用和你的连接，并可生成一份便于分享的报告，其中不含密钥和故事文本。',
      '{diagnostics}會檢查應用程式和你的連線，並可產生一份便於分享的報告，其中不含金鑰和故事文字。',
      '{diagnostics}はアプリと接続を確認し、キーやストーリーの文章を含まない共有用のレポートを作れます。',
      '{diagnostics}은 앱과 연결을 확인하고, 키와 스토리 내용을 뺀 공유용 보고서를 만들 수 있습니다.',
    ],
  'Get a key': ['获取密钥', '取得金鑰', 'キーを取得', '키 받기'],
  'Model list': ['模型列表', '模型列表', 'モデル一覧', '모델 목록'],
  Download: ['下载', '下載', 'ダウンロード', '다운로드'],
  Instructions: ['说明', '說明', '手順', '안내'],
  'Make an account at {site} and set up billing (credit you buy ahead, or a card).': [
    '在 {site} 注册账户并设置付款方式（预先购买额度，或绑定银行卡）。',
    '在 {site} 註冊帳戶並設定付款方式（預先購買額度，或綁定信用卡）。',
    '{site} でアカウントを作り、支払い方法を設定します（前払いのクレジットかカード）。',
    '{site}에서 계정을 만들고 결제 방법을 설정하세요(미리 사 두는 크레딧 또는 카드).',
  ],
  'Make an API key and copy it. Most sites show a key only once, so keep this page open.': [
    '创建一个 API 密钥并复制。大多数网站只显示一次密钥，所以请先别关闭该页面。',
    '建立一個 API 金鑰並複製。大多數網站只顯示一次金鑰，所以請先別關閉該頁面。',
    'API キーを作ってコピーします。キーは一度しか表示されないサイトが多いので、そのページは開いたままにしてください。',
    'API 키를 만들어 복사하세요. 키를 한 번만 보여 주는 사이트가 많으니 그 페이지는 열어 두세요.',
  ],
  'Choose Set it up here, paste the key, and type a model name from the service’s model list.': [
    '选择“在这里设置”，粘贴密钥，然后从服务的模型列表中输入一个模型名称。',
    '選擇「在這裡設定」，貼上金鑰，然後從服務的模型列表中輸入一個模型名稱。',
    '「ここで設定」を押してキーを貼り付け、サービスのモデル一覧にあるモデル名を入力します。',
    '‘여기서 설정’을 누르고 키를 붙여 넣은 뒤, 서비스 모델 목록에 있는 모델 이름을 입력하세요.',
  ],
  'The model field suggests a Claude model; you can type another.': [
    '模型栏会建议一个 Claude 模型；你也可以输入其他模型。',
    '模型欄會建議一個 Claude 模型；你也可以輸入其他模型。',
    'モデル欄には Claude のモデルが提案されます。ほかのモデルを入力してもかまいません。',
    '모델 칸에 Claude 모델이 제안됩니다. 다른 모델을 입력해도 됩니다.',
  ],
  'Sign in with a Google account, then choose Get API key in Google AI Studio.': [
    '用 Google 账户登录，然后在 Google AI Studio 中选择 Get API key。',
    '用 Google 帳戶登入，然後在 Google AI Studio 中選擇 Get API key。',
    'Google アカウントでログインし、Google AI Studio で「Get API key」を選びます。',
    'Google 계정으로 로그인한 뒤 Google AI Studio에서 Get API key를 고르세요.',
  ],
  'One key reaches hundreds of models from many companies. Each model page shows its price and the name to type.':
    [
      '一个密钥就能使用多家公司的数百个模型。每个模型的页面都会显示价格和要输入的名称。',
      '一個金鑰就能使用多家公司的數百個模型。每個模型的頁面都會顯示價格和要輸入的名稱。',
      '1 つのキーで多くの会社の数百のモデルが使えます。各モデルのページに価格と入力する名前が載っています。',
      '키 하나로 여러 회사의 수백 개 모델을 쓸 수 있습니다. 모델마다 페이지에 가격과 입력할 이름이 나옵니다.',
    ],
  'The key is an access token: make a fine-grained one that may make calls to Inference Providers.':
    [
      '密钥就是访问令牌：请创建一个细粒度令牌，并允许它调用 Inference Providers。',
      '金鑰就是存取權杖：請建立一個細粒度權杖，並允許它呼叫 Inference Providers。',
      'キーはアクセストークンです。Inference Providers を呼び出せる fine-grained トークンを作ってください。',
      '키는 액세스 토큰입니다. Inference Providers를 호출할 수 있는 fine-grained 토큰을 만드세요.',
    ],
  'Choose Set it up here. The address is filled in; type the model’s name as the program shows it.':
    [
      '选择“在这里设置”。地址已填好；按程序中显示的名称输入模型名。',
      '選擇「在這裡設定」。位址已填好；依程式中顯示的名稱輸入模型名。',
      '「ここで設定」を押します。アドレスは入力済みです。モデル名はプログラムに表示されているとおりに入力します。',
      '‘여기서 설정’을 누르세요. 주소는 입력되어 있습니다. 모델 이름은 프로그램에 나온 그대로 입력하세요.',
    ],
  'Choose Set it up here. The address is filled in, and any model name works.': [
    '选择“在这里设置”。地址已填好，模型名称随便填都可以。',
    '選擇「在這裡設定」。位址已填好，模型名稱隨便填都可以。',
    '「ここで設定」を押します。アドレスは入力済みで、モデル名は何でもかまいません。',
    '‘여기서 설정’을 누르세요. 주소는 입력되어 있고, 모델 이름은 무엇이든 됩니다.',
  ],
  'Download and install Ollama. It runs in the background.': [
    '下载并安装 Ollama。它会在后台运行。',
    '下載並安裝 Ollama。它會在背景執行。',
    'Ollama をダウンロードしてインストールします。バックグラウンドで動きます。',
    'Ollama를 내려받아 설치하세요. 백그라운드에서 실행됩니다.',
  ],
  'Open a terminal and download a model with this command (or pick one from its list):': [
    '打开终端，用下面的命令下载一个模型（或从它的列表中挑一个）：',
    '開啟終端機，用下面的指令下載一個模型（或從它的列表中挑一個）：',
    'ターミナルを開き、次のコマンドでモデルをダウンロードします（一覧から別のモデルを選んでもかまいません）：',
    '터미널을 열고 다음 명령으로 모델을 내려받으세요(목록에서 다른 모델을 골라도 됩니다):',
  ],
  'Install LM Studio and download a model in it.': [
    '安装 LM Studio，并在其中下载一个模型。',
    '安裝 LM Studio，並在其中下載一個模型。',
    'LM Studio をインストールし、その中でモデルをダウンロードします。',
    'LM Studio를 설치하고 그 안에서 모델을 내려받으세요.',
  ],
  'In the Developer tab, load the model and switch on the server.': [
    '在 Developer 标签页中加载模型，并打开服务器。',
    '在 Developer 分頁中載入模型，並開啟伺服器。',
    '「Developer」タブでモデルを読み込み、サーバーをオンにします。',
    'Developer 탭에서 모델을 불러오고 서버를 켜세요.',
  ],
  'Install Jan and download a model in it.': [
    '安装 Jan，并在其中下载一个模型。',
    '安裝 Jan，並在其中下載一個模型。',
    'Jan をインストールし、その中でモデルをダウンロードします。',
    'Jan을 설치하고 그 안에서 모델을 내려받으세요.',
  ],
  'In Jan’s Settings, open Local API Server, choose the model and start the server. If you give it an API key, paste the same key here.':
    [
      '在 Jan 的设置中打开 Local API Server，选择模型并启动服务器。如果你为它设了 API 密钥，请在这里粘贴同一个密钥。',
      '在 Jan 的設定中開啟 Local API Server，選擇模型並啟動伺服器。如果你為它設了 API 金鑰，請在這裡貼上同一個金鑰。',
      'Jan の設定で「Local API Server」を開き、モデルを選んでサーバーを起動します。API キーを設定した場合は、同じキーをここに貼り付けてください。',
      'Jan의 설정에서 Local API Server를 열고 모델을 골라 서버를 시작하세요. API 키를 정했다면 같은 키를 여기에 붙여 넣으세요.',
    ],
  'Download KoboldCpp and a model file (GGUF), and start it with the model.': [
    '下载 KoboldCpp 和一个模型文件（GGUF），然后用该模型启动它。',
    '下載 KoboldCpp 和一個模型檔（GGUF），然後用該模型啟動它。',
    'KoboldCpp とモデルファイル（GGUF）をダウンロードし、そのモデルで起動します。',
    'KoboldCpp와 모델 파일(GGUF)을 내려받아 그 모델로 실행하세요.',
  ],
  'Get llama.cpp and a model file (GGUF), and start its server:': [
    '获取 llama.cpp 和一个模型文件（GGUF），然后启动它的服务器：',
    '取得 llama.cpp 和一個模型檔（GGUF），然後啟動它的伺服器：',
    'llama.cpp とモデルファイル（GGUF）を用意し、サーバーを起動します：',
    'llama.cpp와 모델 파일(GGUF)을 준비하고 서버를 시작하세요:',
  ],
  'Install text-generation-webui, start it with --api and load a model.': [
    '安装 text-generation-webui，用 --api 启动并加载一个模型。',
    '安裝 text-generation-webui，用 --api 啟動並載入一個模型。',
    'text-generation-webui をインストールし、--api を付けて起動してモデルを読み込みます。',
    'text-generation-webui를 설치하고 --api로 실행한 뒤 모델을 불러오세요.',
  ],
  'vLLM needs a strong graphics card. Start it with the model you want:': [
    'vLLM 需要强劲的显卡。用你想要的模型启动它：',
    'vLLM 需要強勁的顯示卡。用你想要的模型啟動它：',
    'vLLM には高性能なグラフィックカードが必要です。使いたいモデルで起動します：',
    'vLLM에는 강력한 그래픽 카드가 필요합니다. 원하는 모델로 실행하세요:',
  ],
  'Choose Set it up here and type the same model name.': [
    '选择“在这里设置”，然后输入相同的模型名称。',
    '選擇「在這裡設定」，然後輸入相同的模型名稱。',
    '「ここで設定」を押し、同じモデル名を入力します。',
    '‘여기서 설정’을 누르고 같은 모델 이름을 입력하세요.',
  ],
  'Uses an OpenAI key (the same one works). OpenAI charges for each picture, and may ask you to verify your organization before its newest picture models work.':
    [
      '使用 OpenAI 密钥（同一个密钥即可）。OpenAI 按张收费，并且可能要求你先验证组织，才能使用它最新的图片模型。',
      '使用 OpenAI 金鑰（同一個金鑰即可）。OpenAI 按張收費，並且可能要求你先驗證組織，才能使用它最新的圖片模型。',
      'OpenAI のキーを使います（同じキーでかまいません）。OpenAI は画像ごとに料金がかかり、最新の画像モデルを使う前に組織の確認を求められることがあります。',
      'OpenAI 키를 씁니다(같은 키로 됩니다). OpenAI는 이미지마다 요금을 받으며, 최신 이미지 모델을 쓰기 전에 조직 인증을 요구할 수 있습니다.',
    ],
  'Install Stable Diffusion WebUI (or its Forge version) and a model for it.': [
    '安装 Stable Diffusion WebUI（或其 Forge 版本）以及一个模型。',
    '安裝 Stable Diffusion WebUI（或其 Forge 版本）以及一個模型。',
    'Stable Diffusion WebUI（または Forge 版）と、そのためのモデルをインストールします。',
    'Stable Diffusion WebUI(또는 Forge 버전)와 모델을 설치하세요.',
  ],
  'Start it with --api: add it to COMMANDLINE_ARGS in webui-user.bat (Windows) or webui-user.sh (Mac and Linux).':
    [
      '用 --api 启动：把它加到 webui-user.bat（Windows）或 webui-user.sh（Mac 和 Linux）的 COMMANDLINE_ARGS 中。',
      '用 --api 啟動：把它加到 webui-user.bat（Windows）或 webui-user.sh（Mac 和 Linux）的 COMMANDLINE_ARGS 中。',
      '--api を付けて起動します。webui-user.bat（Windows）か webui-user.sh（Mac と Linux）の COMMANDLINE_ARGS に追加してください。',
      '--api로 실행하세요. webui-user.bat(Windows) 또는 webui-user.sh(Mac, Linux)의 COMMANDLINE_ARGS에 추가하면 됩니다.',
    ],
  'Choose Set it up here. The model “default” uses whichever one the WebUI has loaded.': [
    '选择“在这里设置”。模型“default”会使用 WebUI 当前加载的模型。',
    '選擇「在這裡設定」。模型「default」會使用 WebUI 目前載入的模型。',
    '「ここで設定」を押します。モデル「default」は WebUI が読み込んでいるモデルを使います。',
    '‘여기서 설정’을 누르세요. 모델 ‘default’는 WebUI가 불러온 모델을 씁니다.',
  ],
  'Forge version': ['Forge 版本', 'Forge 版本', 'Forge 版', 'Forge 버전'],
  'The setup guide shows how to connect an AI model, with links to get a key from each service or to run one on this computer.':
    [
      '设置指南会说明如何连接 AI 模型，并附有从各服务获取密钥、或在这台电脑上运行模型的链接。',
      '設定指南會說明如何連線 AI 模型，並附有從各服務取得金鑰、或在這台電腦上執行模型的連結。',
      'セットアップガイドでは、AI モデルの接続方法を、各サービスでキーを取得するリンクや、このコンピューターでモデルを動かすリンクとともに説明しています。',
      '설정 가이드에서 AI 모델을 연결하는 방법을, 서비스별 키 받기 링크와 이 컴퓨터에서 모델을 실행하는 링크와 함께 안내합니다.',
    ],
  'Open the setup guide': [
    '打开设置指南',
    '開啟設定指南',
    'セットアップガイドを開く',
    '설정 가이드 열기',
  ],
  'Not sure which to choose, or where to get a key? {guide} walks you through it.': [
    '不确定该选哪个，或去哪里获取密钥？{guide}会一步步带你完成。',
    '不確定該選哪個，或去哪裡取得金鑰？{guide}會一步步帶你完成。',
    'どれを選ぶか、キーをどこで取得するか迷ったら、{guide}で順を追って説明しています。',
    '무엇을 고를지, 키를 어디서 받을지 모르겠다면 {guide}에서 차근차근 안내합니다.',
  ],
  'The setup guide': ['设置指南', '設定指南', 'セットアップガイド', '설정 가이드'],
  'Which model should I use?': [
    '该用哪个模型？',
    '該用哪個模型？',
    'どのモデルを使えばいい？',
    '어떤 모델을 쓰면 좋을까요?',
  ],
  'Suggestions, checked in November 2026. Names change often: the service’s model list has the current ones, and any model you like works.':
    [
      '以下建议核对于 2026 年 11 月。模型名称经常变化：以服务商的模型列表为准，你喜欢的任何模型都可以用。',
      '以下建議核對於 2026 年 11 月。模型名稱經常變動：以服務商的模型清單為準，你喜歡的任何模型都可以用。',
      '2026 年 11 月時点のおすすめです。モデル名はよく変わるので、最新の名前はサービスのモデル一覧で確認してください。好きなモデルならどれでも使えます。',
      '2026년 11월 기준 추천입니다. 모델 이름은 자주 바뀌니 최신 이름은 서비스의 모델 목록에서 확인하세요. 원하는 모델은 무엇이든 쓸 수 있습니다.',
    ],
  'Stories and pictures with one key': [
    '一个密钥同时写故事和画图',
    '一個金鑰同時寫故事和畫圖',
    'ひとつのキーで物語も画像も',
    '키 하나로 이야기와 그림까지',
  ],
  'OpenAI. {terra} writes clear, natural stories quickly, {sol} is stronger for long, twisting plots, and {astra} is the most capable and costs the most. {pictures} makes portraits and item pictures with the same key.':
    [
      'OpenAI。{terra} 写得快，文字清晰自然；{sol} 更擅长又长又曲折的剧情；{astra} 能力最强，价格也最高。{pictures} 用同一个密钥画角色肖像和物品图片。',
      'OpenAI。{terra} 寫得快，文字清晰自然；{sol} 更擅長又長又曲折的劇情；{astra} 能力最強，價格也最高。{pictures} 用同一個金鑰畫角色肖像和物品圖片。',
      'OpenAI。{terra} は速く、明快で自然な文章を書きます。{sol} は長く入り組んだ物語に強く、{astra} は最も高性能で料金も最も高めです。{pictures} なら同じキーで肖像画やアイテムの画像を作れます。',
      'OpenAI. {terra}는 빠르고 명확하며 자연스럽게 씁니다. {sol}은 길고 반전 많은 이야기에 더 강하고, {astra}는 가장 뛰어나지만 가장 비쌉니다. {pictures}로 같은 키로 초상화와 아이템 그림을 만들 수 있습니다.',
    ],
  'Long stories that stay consistent': [
    '长篇故事也前后一致',
    '長篇故事也前後一致',
    '長い物語でも一貫性を保つ',
    '긴 이야기도 일관되게',
  ],
  'Anthropic’s Claude. {opus} keeps characters, threads and tone straight over long stories, and {sonnet} costs less for everyday play. Claude doesn’t make pictures, so add a picture connection too.':
    [
      'Anthropic 的 Claude。{opus} 在长篇故事里也能记清角色、线索和基调；{sonnet} 更便宜，适合日常游玩。Claude 不画图，所以还要另加一个图片连接。',
      'Anthropic 的 Claude。{opus} 在長篇故事裡也能記清角色、線索和基調；{sonnet} 更便宜，適合日常遊玩。Claude 不畫圖，所以還要另加一個圖片連線。',
      'Anthropic の Claude。{opus} は長い物語でも登場人物や伏線、雰囲気をぶれずに保ちます。{sonnet} は普段遊ぶのに安価です。Claude は画像を作らないので、画像用の接続も追加してください。',
      'Anthropic의 Claude. {opus}는 긴 이야기에서도 인물, 복선, 분위기를 흔들림 없이 유지하고, {sonnet}은 평소에 즐기기에 더 저렴합니다. Claude는 그림을 만들지 않으니 그림 연결도 추가하세요.',
    ],
  'Cheap and quick': ['便宜又快', '便宜又快', '安くて速い', '저렴하고 빠르게'],
  '{luna}, {flash} or {haiku}: a fraction of a cent per reply, good for trying things out and for light stories.':
    [
      '{luna}、{flash} 或 {haiku}：每次回复不到一美分，适合试玩和轻松的故事。',
      '{luna}、{flash} 或 {haiku}：每次回覆不到一美分，適合試玩和輕鬆的故事。',
      '{luna}、{flash}、{haiku}：1 回の返答が 1 セント未満。お試しや気軽な物語に向いています。',
      '{luna}, {flash}, {haiku}: 답장 한 번에 1센트도 안 들어 가볍게 시험해 보거나 가벼운 이야기에 좋습니다.',
    ],
  'Many models with one key': [
    '一个密钥用很多模型',
    '一個金鑰用很多模型',
    'ひとつのキーで多くのモデルを',
    '키 하나로 여러 모델을',
  ],
  'OpenRouter offers hundreds of models, including open ones with looser content rules, and its roleplay list shows what other players use most.':
    [
      'OpenRouter 提供数百个模型，包括内容限制较宽松的开源模型；它的角色扮演榜单显示其他玩家最常用的模型。',
      'OpenRouter 提供數百個模型，包括內容限制較寬鬆的開源模型；它的角色扮演榜單顯示其他玩家最常用的模型。',
      'OpenRouter には数百のモデルがあり、内容の制限がゆるめのオープンモデルもあります。ロールプレイ一覧で他のプレイヤーがよく使うモデルがわかります。',
      'OpenRouter에는 수백 개의 모델이 있고 콘텐츠 규칙이 느슨한 오픈 모델도 있습니다. 롤플레이 목록에서 다른 플레이어가 가장 많이 쓰는 모델을 볼 수 있습니다.',
    ],
  'Free and private': ['免费又私密', '免費又私密', '無料でプライベート', '무료이고 비공개로'],
  'On this computer with Ollama or LM Studio. {small} runs on almost any computer. Models of 12 to 14B write much better and want about 16 GB of memory; 27 to 32B models need a strong graphics card.':
    [
      '用 Ollama 或 LM Studio 在本机运行。{small} 几乎在任何电脑上都能跑。12B 到 14B 的模型写得好得多，需要约 16 GB 内存；27B 到 32B 的模型需要性能强的显卡。',
      '用 Ollama 或 LM Studio 在本機執行。{small} 幾乎在任何電腦上都能跑。12B 到 14B 的模型寫得好得多，需要約 16 GB 記憶體；27B 到 32B 的模型需要效能強的顯示卡。',
      'Ollama か LM Studio でこのコンピューター上で動かします。{small} はほぼどのコンピューターでも動きます。12〜14B のモデルはずっと上手に書けますが、約 16 GB のメモリが必要です。27〜32B のモデルには高性能なグラフィックカードが必要です。',
      'Ollama나 LM Studio로 이 컴퓨터에서 실행합니다. {small}은 거의 모든 컴퓨터에서 돌아갑니다. 12~14B 모델은 훨씬 잘 쓰지만 메모리가 16GB 정도 필요하고, 27~32B 모델은 성능 좋은 그래픽카드가 필요합니다.',
    ],
  '{flare} is quick for portraits and items, and {sunburst} takes more care over detail. Free on this computer: Stable Diffusion WebUI.':
    [
      '{flare} 画肖像和物品又快又好；{sunburst} 更注重细节。想在本机免费画图：Stable Diffusion WebUI。',
      '{flare} 畫肖像和物品又快又好；{sunburst} 更注重細節。想在本機免費畫圖：Stable Diffusion WebUI。',
      '{flare} は肖像画やアイテムを手早く描き、{sunburst} は細部をより丁寧に描きます。このコンピューターで無料なら Stable Diffusion WebUI。',
      '{flare}는 초상화와 아이템을 빠르게 그리고, {sunburst}는 세부를 더 공들여 그립니다. 이 컴퓨터에서 무료로: Stable Diffusion WebUI.',
    ],
  'OpenAI retired this picture model. Edit the connection and choose {model}.': [
    'OpenAI 已停用这个图片模型。请编辑此连接并改选 {model}。',
    'OpenAI 已停用這個圖片模型。請編輯此連線並改選 {model}。',
    'OpenAI はこの画像モデルの提供を終了しました。接続を編集して {model} を選んでください。',
    'OpenAI가 이 그림 모델을 종료했습니다. 연결을 편집해 {model}을(를) 선택하세요.',
  ],
  'Makes portraits and item pictures from their descriptions. It never writes story replies; choose it under Pictures in Settings.':
    [
      '根据描述生成角色肖像和物品图片。它从不撰写故事回复；请在设置的“图片”中选择它。',
      '根據描述產生角色肖像和物品圖片。它從不撰寫故事回覆；請在設定的「圖片」中選擇它。',
      '説明から肖像画やアイテムの画像を作ります。ストーリーの返信は書きません。設定の「画像」で選んでください。',
      '설명으로 초상화와 아이템 그림을 만듭니다. 스토리 답장은 쓰지 않으니 설정의 "이미지"에서 고르세요.',
    ],
  'Pictures (portraits and items)': [
    '图片（肖像和物品）',
    '圖片（肖像和物品）',
    '画像（肖像画とアイテム）',
    '이미지(초상화와 아이템)',
  ],
  "Makes portraits and item pictures. OpenAI charges for each picture; the app records every request but can't price pictures.":
    [
      '生成角色肖像和物品图片。OpenAI 按张收费；应用会记录每次请求，但无法为图片计价。',
      '產生角色肖像和物品圖片。OpenAI 按張收費；應用程式會記錄每次請求，但無法為圖片計價。',
      '肖像画やアイテムの画像を作ります。OpenAI は画像ごとに課金します。アプリはリクエストをすべて記録しますが、画像の料金は計算できません。',
      '초상화와 아이템 그림을 만듭니다. OpenAI는 이미지마다 요금을 받습니다. 앱은 요청을 모두 기록하지만 이미지 가격은 계산하지 못합니다.',
    ],
  'Pictures (optional)': ['图片（可选）', '圖片（可選）', '画像（任意）', '이미지(선택)'],
  'A picture connection draws portraits of characters and pictures of items from their descriptions. Pictures are always asked for as safe for work, and you can use your own pictures instead.':
    [
      '图片连接会根据描述画出角色肖像和物品图片。图片始终以适合工作场合（SFW）的内容来请求，你也可以改用自己的图片。',
      '圖片連線會根據描述畫出角色肖像和物品圖片。圖片一律以適合工作場合（SFW）的內容來請求，你也可以改用自己的圖片。',
      '画像の接続は、説明からキャラクターの肖像画やアイテムの画像を描きます。画像は常に職場でも安全な（SFW）内容で依頼され、自分の画像を使うこともできます。',
      '이미지 연결은 설명으로 캐릭터 초상화와 아이템 그림을 그립니다. 그림은 항상 업무 환경에도 안전한(SFW) 내용으로 요청되며, 직접 가진 이미지를 써도 됩니다.',
    ],
  'Built in. Simple replies in English, works without internet, never costs anything.': [
    '内置。用英文写简单的回复，无需联网，完全免费。',
    '內建。用英文寫簡單的回覆，無需連網，完全免費。',
    '内蔵です。英語でシンプルな返信を書き、インターネットなしで動き、費用はかかりません。',
    '내장되어 있습니다. 영어로 간단한 답장을 쓰고 인터넷 없이 작동하며 비용이 들지 않습니다.',
  ],
};
