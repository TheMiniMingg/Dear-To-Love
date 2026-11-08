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
  'Connect a service': ['连接一个服务', '連線一個服務', 'サービスに接続する', '서비스 연결하기'],
  'Test it and start playing': [
    '测试并开始玩',
    '測試並開始玩',
    'テストして遊び始める',
    '테스트하고 플레이 시작하기',
  ],
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
  'On this page': ['本页内容', '本頁內容', 'このページの内容', '이 페이지의 내용'],
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
  'Long stories that stay consistent': [
    '长篇故事也前后一致',
    '長篇故事也前後一致',
    '長い物語でも一貫性を保つ',
    '긴 이야기도 일관되게',
  ],
  'Free and private': ['免费又私密', '免費又私密', '無料でプライベート', '무료이고 비공개로'],
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
  Rose: ['玫瑰', '玫瑰', 'ローズ', '로즈'],
  'Soft pink, light or dark with your computer.': [
    '柔和的粉色，随电脑切换浅色或深色。',
    '柔和的粉色，隨電腦切換淺色或深色。',
    'やわらかなピンク。パソコンに合わせてライトかダークに。',
    '부드러운 분홍색. 컴퓨터 설정에 따라 밝게 또는 어둡게.',
  ],
  Midnight: ['午夜', '午夜', 'ミッドナイト', '미드나잇'],
  'Deep blue with moonlit text, for late reading.': [
    '深蓝底色配月光般的文字，适合深夜阅读。',
    '深藍底色配月光般的文字，適合深夜閱讀。',
    '月明かりのような文字の深い青。夜更けの読書に。',
    '달빛 같은 글자의 짙은 파랑. 늦은 밤 읽기에.',
  ],
  Parchment: ['羊皮纸', '羊皮紙', 'パーチメント', '양피지'],
  'Warm paper and dark ink, like an old book.': [
    '温暖的纸色和深色墨迹，像一本旧书。',
    '溫暖的紙色和深色墨跡，像一本舊書。',
    '温かみのある紙と濃いインク。古い本のように。',
    '따뜻한 종이와 짙은 잉크, 오래된 책처럼.',
  ],
  Look: ['外观', '外觀', '見た目', '디자인'],
  Theme: ['主题', '主題', 'テーマ', '테마'],
  'Give each story a look that fits its genre': [
    '让每个故事使用符合其类型的外观',
    '讓每個故事使用符合其類型的外觀',
    '物語ごとにジャンルに合った見た目にする',
    '이야기마다 장르에 맞는 디자인 쓰기',
  ],
  Sound: ['声音', '聲音', 'サウンド', '소리'],
  'Chime when a reply is ready in another story': [
    '其他故事的回复写好时响铃',
    '其他故事的回覆寫好時響鈴',
    'ほかのストーリーの返信ができたらチャイムを鳴らす',
    '다른 스토리의 답장이 준비되면 알림음 울리기',
  ],
  'A reply keeps writing while you read another story or look at your library. A notice says when it is ready either way.':
    [
      '你去读别的故事或查看书库时，回复会继续撰写。写好时无论如何都会有提示。',
      '你去讀別的故事或查看書庫時，回覆會繼續撰寫。寫好時無論如何都會有提示。',
      'ほかのストーリーを読んだりライブラリを見たりしている間も、返信は書き続けられます。できあがると、どちらにしても通知が出ます。',
      '다른 스토리를 읽거나 라이브러리를 보는 동안에도 답장은 계속 써져요. 준비되면 어느 쪽이든 알림이 떠요.',
    ],
  'What the app plays on this computer.': [
    '应用在这台电脑上播放的声音。',
    '應用程式在這台電腦上播放的聲音。',
    'このパソコンでアプリが鳴らす音。',
    '이 컴퓨터에서 앱이 내는 소리.',
  ],
  'Settings sections': ['设置分区', '設定分區', '設定のセクション', '설정 섹션'],
  Narrow: ['窄', '窄', '狭い', '좁게'],
  Medium: ['中', '中', '中くらい', '중간'],
  Wide: ['宽', '寬', '広い', '넓게'],
  Compact: ['紧凑', '緊湊', '詰める', '촘촘하게'],
  Roomy: ['宽松', '寬鬆', 'ゆったり', '여유 있게'],
  Small: ['小', '小', '小', '작게'],
  Large: ['大', '大', '大', '크게'],
  Larger: ['更大', '更大', '特大', '더 크게'],
  Largest: ['最大', '最大', '最大', '가장 크게'],
  'Column width': ['栏宽', '欄寬', '行の幅', '단 너비'],
  'Line spacing': ['行距', '行距', '行間', '줄 간격'],
  'Sample of how stories look': [
    '故事显示效果示例',
    '故事顯示效果範例',
    '物語の見え方の見本',
    '이야기가 보이는 모습 예시',
  ],
  'The bell over the door rings. Mina looks up from the espresso machine, and for a moment she forgets the cup in her hand.':
    [
      '门上的铃铛响了。米娜从咖啡机前抬起头，一时忘了手里的杯子。',
      '門上的鈴鐺響了。米娜從咖啡機前抬起頭，一時忘了手裡的杯子。',
      'ドアの上のベルが鳴る。ミナはエスプレッソマシンから顔を上げ、一瞬、手にしたカップのことを忘れる。',
      '문 위의 종이 울린다. 미나는 에스프레소 머신에서 고개를 들고, 잠시 손에 든 컵을 잊는다.',
    ],
  'Mina:': ['米娜：', '米娜：', 'ミナ：', '미나:'],
  '“You came back. I was starting to think the scone scared you off.”': [
    '“你回来了。我还以为那个司康把你吓跑了呢。”',
    '「你回來了。我還以為那個司康把你嚇跑了呢。」',
    '「戻ってきたのね。スコーンに怖気づいたのかと思い始めてた」',
    '“돌아왔네요. 스콘 때문에 겁먹고 도망간 줄 알았어요.”',
  ],
  'How the app and your stories look on this computer.': [
    '应用和你的故事在这台电脑上的样子。',
    '應用程式和你的故事在這台電腦上的樣子。',
    'このコンピューターでのアプリと物語の見た目です。',
    '이 컴퓨터에서 앱과 이야기가 보이는 모습입니다.',
  ],
  Reading: ['阅读', '閱讀', '読みやすさ', '읽기'],
  'Privacy and data': ['隐私与数据', '隱私與資料', 'プライバシーとデータ', '개인정보와 데이터'],
  'Your stories, pictures and settings stay on this computer. The app sends nothing anywhere except the requests to the AI connections you add, and the once-a-day check for a new version if it is on.':
    [
      '你的故事、图片和设置都留在这台电脑上。除了发给你添加的 AI 连接的请求，以及（如果开启）每天一次检查新版本，应用不会向任何地方发送内容。',
      '你的故事、圖片和設定都留在這台電腦上。除了發給你新增的 AI 連線的請求，以及（如果開啟）每天一次檢查新版本，應用程式不會向任何地方傳送內容。',
      '物語、画像、設定はこのコンピューターに保存されます。アプリが外に送るのは、追加した AI 接続へのリクエストと、オンにしている場合の 1 日 1 回の新バージョン確認だけです。',
      '이야기, 그림, 설정은 이 컴퓨터에 남습니다. 앱은 당신이 추가한 AI 연결로 보내는 요청과, 켜 두었다면 하루 한 번 새 버전 확인 외에는 아무 데도 보내지 않습니다.',
    ],
  "API keys are kept in your computer's own password store, never in the stories, backups, exports or reports.":
    [
      'API 密钥保存在电脑自带的密码库里，绝不会出现在故事、备份、导出文件或报告中。',
      'API 金鑰保存在電腦內建的密碼庫裡，絕不會出現在故事、備份、匯出檔案或報告中。',
      'API キーはコンピューター自身のパスワード保管庫に保存され、物語、バックアップ、書き出し、レポートには決して入りません。',
      'API 키는 컴퓨터 자체의 암호 저장소에 보관되며, 이야기, 백업, 내보내기, 보고서에는 절대 들어가지 않습니다.',
    ],
  'Backups and exports are yours to keep or share. A support report from Diagnostics holds counts and check results only: no story text and no keys.':
    [
      '备份和导出文件归你保管或分享。诊断里的支持报告只包含数量和检查结果：没有故事文字，也没有密钥。',
      '備份和匯出檔案歸你保管或分享。診斷裡的支援報告只包含數量和檢查結果：沒有故事文字，也沒有金鑰。',
      'バックアップと書き出したファイルは、保管も共有もあなた次第です。診断のサポートレポートには件数とチェック結果だけが入り、物語の本文やキーは含まれません。',
      '백업과 내보낸 파일은 보관하든 공유하든 당신의 것입니다. 진단의 지원 보고서에는 개수와 점검 결과만 담기며, 이야기 본문이나 키는 들어가지 않습니다.',
    ],
  'Most things in a story have a key: save, search, the menu, larger or smaller text and more. Press F1 anywhere to see them all.':
    [
      '故事里的大多数操作都有快捷键：保存、搜索、菜单、放大或缩小文字等等。在任何地方按 F1 即可查看全部。',
      '故事裡的大多數操作都有快捷鍵：儲存、搜尋、選單、放大或縮小文字等等。在任何地方按 F1 即可查看全部。',
      '物語のほとんどの操作にはキーがあります。保存、検索、メニュー、文字の拡大・縮小などです。どこでも F1 を押すと一覧が見られます。',
      '이야기 속 대부분의 기능에는 단축키가 있습니다. 저장, 검색, 메뉴, 글자 크게·작게 등. 어디서든 F1을 누르면 모두 볼 수 있습니다.',
    ],
  'Show keyboard shortcuts': [
    '显示键盘快捷键',
    '顯示鍵盤快捷鍵',
    'キーボードショートカットを表示',
    '키보드 단축키 보기',
  ],
  Neon: ['霓虹', '霓虹', 'ネオン', '네온'],
  Café: ['咖啡馆', '咖啡館', 'カフェ', '카페'],
  Gothic: ['哥特', '哥德', 'ゴシック', '고딕'],
  'Near black with cyan and magenta, for science fiction.': [
    '近乎全黑，配青色和洋红，适合科幻。',
    '近乎全黑，配青色和洋紅，適合科幻。',
    'ほぼ黒にシアンとマゼンタ。SF向けです。',
    '검정에 가까운 바탕에 청록과 자홍. SF에 어울립니다.',
  ],
  'Latte browns and a soft green, for cozy stories.': [
    '拿铁般的棕色和柔和的绿色，适合温馨的故事。',
    '拿鐵般的棕色和柔和的綠色，適合溫馨的故事。',
    'ラテのような茶色とやわらかな緑。心温まるストーリー向けです。',
    '라테 같은 갈색과 부드러운 초록. 포근한 스토리에 어울립니다.',
  ],
  'Charcoal and deep red, with serif headings, for horror.': [
    '炭灰和深红，标题用衬线字体，适合恐怖故事。',
    '炭灰和深紅，標題用襯線字體，適合恐怖故事。',
    'チャコールと深紅、見出しは明朝系。ホラー向けです。',
    '숯빛 회색과 짙은 빨강, 제목은 명조체. 공포물에 어울립니다.',
  ],
  'Horror and mysteries read in Gothic, science fiction in Neon, thrillers in Midnight, fantasy and history on Parchment, action and war in Ember, text adventures in Terminal, nature in Forest, the sea in Ocean, whimsical stories in Lavender, cozy stories in Café and romance in Rose. Change any story with Look beside it while reading.':
    [
      '恐怖和悬疑用“哥特”，科幻用“霓虹”，惊悚用“午夜”，奇幻和历史用“羊皮纸”，动作和战争用“余烬”，文字冒险用“终端”，自然题材用“森林”，海洋题材用“海洋”，奇幻梦幻的故事用“薰衣草”，温馨故事用“咖啡馆”，爱情用“玫瑰”。阅读时可用旁边的“外观”更改任何故事。',
      '恐怖和懸疑用「哥德」，科幻用「霓虹」，驚悚用「午夜」，奇幻和歷史用「羊皮紙」，動作和戰爭用「餘燼」，文字冒險用「終端機」，自然題材用「森林」，海洋題材用「海洋」，奇幻夢幻的故事用「薰衣草」，溫馨故事用「咖啡館」，愛情用「玫瑰」。閱讀時可用旁邊的「外觀」變更任何故事。',
      'ホラーとミステリーは「ゴシック」、SFは「ネオン」、スリラーは「ミッドナイト」、ファンタジーと歴史ものは「パーチメント」、アクションと戦争ものは「エンバー」、テキストアドベンチャーは「ターミナル」、自然ものは「フォレスト」、海が舞台なら「オーシャン」、夢のようなストーリーは「ラベンダー」、心温まるストーリーは「カフェ」、恋愛は「ローズ」で読みます。読んでいるときに横の「見た目」からどのストーリーでも変えられます。',
      '공포와 미스터리는 고딕, SF는 네온, 스릴러는 미드나잇, 판타지와 역사물은 양피지, 액션과 전쟁물은 엠버, 텍스트 어드벤처는 터미널, 자연을 다룬 이야기는 포레스트, 바다 이야기는 오션, 몽환적인 스토리는 라벤더, 포근한 스토리는 카페, 로맨스는 로즈로 읽습니다. 읽는 중에 옆의 디자인 버튼으로 어떤 스토리든 바꿀 수 있습니다.',
    ],
  Slower: ['较慢', '較慢', 'ゆっくり', '느리게'],
  Faster: ['较快', '較快', '速く', '빠르게'],
  Voice: ['语音', '語音', '音声', '음성'],
  'The computer’s usual voice': [
    '电脑的默认语音',
    '電腦的預設語音',
    'コンピューターの標準の音声',
    '컴퓨터의 기본 음성',
  ],
  Speed: ['语速', '語速', '速さ', '속도'],
  'Try it': ['试听', '試聽', '試しに聞く', '들어 보기'],
  'The bell over the door rings, and for a moment the whole café goes quiet.': [
    '门上的铃铛响了，整个咖啡馆一时安静下来。',
    '門上的鈴鐺響了，整間咖啡館一時安靜下來。',
    'ドアの上のベルが鳴り、一瞬、カフェ全体が静まりかえる。',
    '문 위의 종이 울리고, 잠시 카페 전체가 조용해진다.',
  ],
  'Connected, but “{model}” is not in the server’s model list. Check the model name.': [
    '已连接，但服务器的模型列表中没有“{model}”。请检查模型名称。',
    '已連線，但伺服器的模型清單中沒有「{model}」。請檢查模型名稱。',
    '接続できましたが、「{model}」はサーバーのモデル一覧にありません。モデル名を確認してください。',
    '연결되었지만 서버의 모델 목록에 “{model}”이(가) 없습니다. 모델 이름을 확인하세요.',
  ],
  'Connected. “{model}” is available.': [
    '已连接。“{model}”可用。',
    '已連線。「{model}」可以使用。',
    '接続できました。「{model}」を使えます。',
    '연결되었습니다. “{model}”을(를) 사용할 수 있습니다.',
  ],
  'No API key is saved for this connection, and most online services need one. Choose Edit to add it.':
    [
      '这个连接没有保存 API 密钥，而大多数在线服务都需要密钥。选择“编辑”来添加。',
      '這個連線沒有儲存 API 金鑰，而大多數線上服務都需要金鑰。選擇「編輯」來新增。',
      'この接続には API キーが保存されていません。ほとんどのオンラインサービスでは必要です。「編集」から追加してください。',
      '이 연결에는 API 키가 저장되어 있지 않으며, 대부분의 온라인 서비스는 키가 필요합니다. 편집을 눌러 추가하세요.',
    ],
  'The short version': ['简要说明', '簡要說明', 'まずはここだけ', '핵심 요약'],
  'Recommended models': ['推荐模型', '推薦模型', 'おすすめのモデル', '추천 모델'],
  'Costs and your budget': ['费用与预算', '費用與預算', '費用と予算', '비용과 예산'],
  free: ['免费', '免費', '無料', '무료'],
  'about {cost} a reply': [
    '每条回复约 {cost}',
    '每則回覆約 {cost}',
    '返信 1 回あたり約 {cost}',
    '답장 1회에 약 {cost}',
  ],
  'price on its model page': [
    '价格见模型页面',
    '價格見模型頁面',
    '料金はモデルのページに',
    '가격은 모델 페이지에서',
  ],
  'Set up {model}': ['设置 {model}', '設定 {model}', '{model} を設定', '{model} 설정'],
  'One reply': ['一条回复', '一則回覆', '返信 1 回', '답장 1회'],
  '100 replies': ['100 条回复', '100 則回覆', '返信 100 回', '답장 100회'],
  Recommended: ['推荐', '推薦', 'おすすめ', '추천'],
  'Play free, right now': [
    '现在就免费玩',
    '現在就免費玩',
    '今すぐ無料で遊ぶ',
    '지금 바로 무료로 플레이',
  ],
  'The built-in offline storyteller needs nothing: no account, no internet. In the library, choose {newStory}, pick a story and choose {start}.':
    [
      '内置的离线讲述者什么都不需要：不用账户，也不用联网。在故事库中选择{newStory}，挑一个故事，然后选择{start}。',
      '內建的離線講述者什麼都不需要：不用帳戶，也不用連網。在故事庫中選擇{newStory}，挑一個故事，然後選擇{start}。',
      '内蔵のオフライン語り手なら何も要りません。アカウントもインターネットも不要です。ライブラリで{newStory}を選び、ストーリーを選んで{start}を押します。',
      '내장된 오프라인 이야기꾼은 아무것도 필요 없습니다. 계정도 인터넷도 필요 없어요. 라이브러리에서 {newStory}를 고르고 이야기를 선택한 뒤 {start}를 누르세요.',
    ],
  'Better stories: connect an AI': [
    '想要更好的故事：连接 AI',
    '想要更好的故事：連接 AI',
    'もっと良い物語に：AI をつなぐ',
    '더 좋은 이야기를 원하면: AI 연결',
  ],
  'Takes about five minutes. Most services cost 1 to 3 cents a reply in a long story; models on your own computer are free. You can switch any time, even mid-story.':
    [
      '大约五分钟。在长故事中，大多数服务每条回复花费 1 到 3 美分；在你自己电脑上运行的模型免费。随时都可以切换，故事进行中也行。',
      '大約五分鐘。在長故事中，大多數服務每則回覆花費 1 到 3 美分；在你自己電腦上執行的模型免費。隨時都可以切換，故事進行中也行。',
      '5 分ほどで済みます。長い物語では、多くのサービスは返信 1 回あたり 1〜3 セントです。自分のパソコンで動くモデルは無料です。いつでも、物語の途中でも切り替えられます。',
      '5분 정도면 됩니다. 긴 이야기에서 대부분의 서비스는 답장 1회에 1~3센트이고, 내 컴퓨터에서 돌리는 모델은 무료입니다. 언제든, 이야기 도중에도 바꿀 수 있어요.',
    ],
  'See recommended models': [
    '查看推荐模型',
    '查看推薦模型',
    'おすすめのモデルを見る',
    '추천 모델 보기',
  ],
  'Stay within budget': ['控制在预算之内', '控制在預算之內', '予算内に収める', '예산 안에서 쓰기'],
  '{usage} estimates what each reply cost and can pause paid replies at a monthly limit you choose. Set a limit on the service’s own site too.':
    [
      '{usage}会估算每条回复的费用，并能在达到你设定的每月上限时暂停付费回复。也请在服务商自己的网站上设置上限。',
      '{usage}會估算每則回覆的費用，並能在達到你設定的每月上限時暫停付費回覆。也請在服務商自己的網站上設定上限。',
      '{usage}は返信ごとの費用を見積もり、自分で決めた月の上限で有料の返信を止められます。サービス側のサイトでも上限を設定しておきましょう。',
      '{usage}은 답장마다 든 비용을 추정하고, 직접 정한 월 한도에서 유료 답장을 멈출 수 있습니다. 서비스 자체 사이트에서도 한도를 설정하세요.',
    ],
  'Your keys stay here': [
    '你的密钥留在这里',
    '你的金鑰留在這裡',
    'キーはこのパソコンに',
    '키는 이 컴퓨터에만',
  ],
  "API keys are kept in your computer's own password store and sent only to the service they belong to. Never in stories, exports or reports.":
    [
      'API 密钥保存在你电脑自带的密码库中，只会发送给它所属的服务。绝不会出现在故事、导出文件或报告中。',
      'API 金鑰保存在你電腦內建的密碼庫中，只會傳送給它所屬的服務。絕不會出現在故事、匯出檔案或報告中。',
      'API キーはパソコン自体のパスワード保管庫に保存され、そのキーのサービスにだけ送られます。ストーリー、書き出し、レポートには決して入りません。',
      'API 키는 컴퓨터 자체의 비밀번호 저장소에 보관되며 해당 서비스에만 전송됩니다. 이야기, 내보내기, 보고서에는 절대 들어가지 않아요.',
    ],
  'Good places to start, checked {checked}. Set up opens a new connection with the service and model filled in; you paste the key.':
    [
      '适合起步的选择，核对于 {checked}。点“设置”会打开一个已填好服务和模型的新连接，你只需粘贴密钥。',
      '適合起步的選擇，核對於 {checked}。點「設定」會開啟一個已填好服務和模型的新連線，你只需貼上金鑰。',
      '始めやすいモデルです（{checked}時点で確認）。「設定」を押すと、サービスとモデルが入力済みの新しい接続が開きます。あとはキーを貼り付けるだけです。',
      '시작하기 좋은 모델들입니다({checked} 기준 확인). 설정을 누르면 서비스와 모델이 채워진 새 연결이 열리고, 키만 붙여 넣으면 됩니다.',
    ],
  'Names change often: each service’s model list has the current ones, and any model you like works. The connection form suggests a few more for each service.':
    [
      '模型名称经常变化：各服务的模型列表里有最新的名称，你喜欢的任何模型都能用。连接表单还会为每个服务多推荐几个。',
      '模型名稱經常變化：各服務的模型列表裡有最新的名稱，你喜歡的任何模型都能用。連線表單還會為每個服務多推薦幾個。',
      'モデル名はよく変わります。最新の名前は各サービスのモデル一覧にあり、好きなモデルを使えます。接続フォームでもサービスごとにいくつか提案します。',
      '모델 이름은 자주 바뀝니다. 최신 이름은 각 서비스의 모델 목록에 있고, 원하는 모델은 무엇이든 쓸 수 있어요. 연결 양식에서도 서비스마다 몇 가지를 더 추천합니다.',
    ],
  'OpenRouter roleplay list': [
    'OpenRouter 角色扮演榜',
    'OpenRouter 角色扮演榜',
    'OpenRouter のロールプレイ一覧',
    'OpenRouter 롤플레이 목록',
  ],
  'Paid services charge for the words they read and write. Each reply sends the story so far, up to the connection’s context limit, so replies cost a little more as a story grows.':
    [
      '付费服务按读取和写出的文字收费。每条回复都会发送到目前为止的故事（最多到连接的上下文上限），所以故事越长，回复就稍微越贵。',
      '付費服務按讀取和寫出的文字收費。每則回覆都會傳送到目前為止的故事（最多到連線的上下文上限），所以故事越長，回覆就稍微越貴。',
      '有料サービスは、読む文字と書く文字の量で課金されます。返信のたびにそれまでの物語を（接続のコンテキスト上限まで）送るので、物語が長くなるほど返信は少しずつ高くなります。',
      '유료 서비스는 읽고 쓰는 글자 양에 따라 요금을 받습니다. 답장할 때마다 지금까지의 이야기를(연결의 컨텍스트 한도까지) 보내므로, 이야기가 길어질수록 답장이 조금씩 비싸집니다.',
    ],
  'For a reply well into a story: about 12,000 tokens read and 600 written, plus a little thinking for models that think first. Early replies cost much less. List prices checked {checked}; the services’ pricing pages have the current ones.':
    [
      '按故事进行一段时间后的一条回复计算：读取约 12,000 个 token、写出约 600 个，先思考的模型还要加上少量思考。开头的回复便宜得多。标价核对于 {checked}；最新价格请看各服务的定价页面。',
      '按故事進行一段時間後的一則回覆計算：讀取約 12,000 個 token、寫出約 600 個，先思考的模型還要加上少量思考。開頭的回覆便宜得多。標價核對於 {checked}；最新價格請看各服務的定價頁面。',
      '物語がかなり進んだあとの返信 1 回分：読み込み約 12,000 トークン、書き出し約 600 トークン。先に考えるモデルは少し考える分が加わります。序盤の返信はずっと安くなります。定価は{checked}時点で確認したもので、最新の料金は各サービスの料金ページにあります。',
      '이야기가 꽤 진행된 뒤의 답장 1회 기준: 약 12,000토큰을 읽고 600토큰을 씁니다. 먼저 생각하는 모델은 생각하는 분량이 조금 더해집니다. 초반 답장은 훨씬 저렴해요. 정가는 {checked} 기준으로 확인했으며, 최신 가격은 각 서비스의 요금 페이지에 있습니다.',
    ],
  '{usage} shows what each connection has cost, warns you near a monthly limit you choose, and can pause paid replies when it is reached.':
    [
      '{usage}会显示每个连接花了多少钱，在接近你设定的每月上限时提醒你，并能在达到上限时暂停付费回复。',
      '{usage}會顯示每個連線花了多少錢，在接近你設定的每月上限時提醒你，並能在達到上限時暫停付費回覆。',
      '{usage}では接続ごとの費用がわかり、決めた月の上限に近づくと知らせ、上限に達したら有料の返信を止められます。',
      '{usage}에서는 연결마다 든 비용을 보여 주고, 정한 월 한도에 가까워지면 알려 주며, 한도에 닿으면 유료 답장을 멈출 수 있습니다.',
    ],
  'It needs each model’s prices. Under Prices there, {listed} fills them in for the models this guide lists; for others, copy them from the service’s pricing page.':
    [
      '这需要每个模型的价格。在那里的“价格”中，{listed}会为本指南列出的模型自动填好；其他模型请从服务商的定价页面复制。',
      '這需要每個模型的價格。在那裡的「價格」中，{listed}會為本指南列出的模型自動填好；其他模型請從服務商的定價頁面複製。',
      'そのためにはモデルごとの料金が必要です。そこの「料金」で{listed}を押すと、このガイドに載っているモデルは自動で入力されます。それ以外はサービスの料金ページから写してください。',
      '이를 위해 모델마다 가격이 필요합니다. 그곳의 가격에서 {listed}를 누르면 이 안내에 나온 모델은 자동으로 채워지고, 다른 모델은 서비스의 요금 페이지에서 옮겨 적으세요.',
    ],
  'Use the listed prices': [
    '使用列出的价格',
    '使用列出的價格',
    '掲載の料金を使う',
    '안내된 가격 사용',
  ],
  "Set a spending limit on the service's own site too: the app can't see your balance, and that limit is the one that really stops charges.":
    [
      '也请在服务商自己的网站上设置消费上限：应用看不到你的余额，而那里的上限才是真正能停止扣费的。',
      '也請在服務商自己的網站上設定消費上限：應用程式看不到你的餘額，而那裡的上限才是真正能停止扣款的。',
      'サービス側のサイトでも利用上限を設定してください。アプリには残高が見えず、本当に請求を止められるのはそちらの上限です。',
      '서비스 자체 사이트에서도 지출 한도를 설정하세요. 앱은 잔액을 볼 수 없고, 실제로 청구를 막는 것은 그쪽 한도입니다.',
    ],
  'A lower context limit (the connection’s Advanced settings) keeps long stories cheaper; older parts of the story are summarized to fit.':
    [
      '调低上下文上限（在连接的高级设置中）能让长故事更省钱；较早的故事内容会被概括以便放得下。',
      '調低上下文上限（在連線的進階設定中）能讓長故事更省錢；較早的故事內容會被概括以便放得下。',
      'コンテキスト上限（接続の詳細設定）を下げると長い物語が安く済みます。物語の古い部分は収まるように要約されます。',
      '컨텍스트 한도(연결의 고급 설정)를 낮추면 긴 이야기가 더 저렴해집니다. 이야기의 앞부분은 들어가도록 요약됩니다.',
    ],
  'OpenAI limits': ['OpenAI 限额', 'OpenAI 限額', 'OpenAI の上限', 'OpenAI 한도'],
  'Anthropic limits': ['Anthropic 限额', 'Anthropic 限額', 'Anthropic の上限', 'Anthropic 한도'],
  'OpenRouter key limits': [
    'OpenRouter 密钥限额',
    'OpenRouter 金鑰限額',
    'OpenRouter のキー上限',
    'OpenRouter 키 한도',
  ],
  'Pick one and open it for its steps; open Step by step inside for every click. Links open in your browser; Set it up here opens a new connection with the service filled in.':
    [
      '选一个并展开查看步骤；展开里面的“逐步说明”可看到每一次点击。链接会在浏览器中打开；“在这里设置”会打开一个已填好该服务的新连接。',
      '選一個並展開查看步驟；展開裡面的「逐步說明」可看到每一次點擊。連結會在瀏覽器中開啟；「在這裡設定」會開啟一個已填好該服務的新連線。',
      'どれかを選んで開くと手順が見られます。中の「ステップごとの手順」を開けば、クリックひとつずつ説明します。リンクはブラウザで開き、「ここで設定」はそのサービスを入力済みの新しい接続を開きます。',
      '하나를 골라 펼치면 단계가 나옵니다. 안의 단계별 안내를 펼치면 클릭 하나하나까지 설명해요. 링크는 브라우저에서 열리고, 여기서 설정은 해당 서비스가 채워진 새 연결을 엽니다.',
    ],
  'The service’s rules stopped this reply. Try another reply, change the action, or use a model with looser rules, such as one on OpenRouter or your own computer.':
    [
      '服务的规则拦下了这条回复。可以换一条回复、修改行动，或改用规则更宽松的模型，比如 OpenRouter 上的或你自己电脑上的模型。',
      '服務的規則攔下了這則回覆。可以換一則回覆、修改行動，或改用規則更寬鬆的模型，例如 OpenRouter 上的或你自己電腦上的模型。',
      'サービスのルールでこの返信が止められました。別の返信を試す、行動を変える、または OpenRouter や自分のパソコンのモデルなど、ルールの緩いモデルを使ってください。',
      '서비스 규칙 때문에 이 답장이 막혔습니다. 다른 답장을 시도하거나, 행동을 바꾸거나, OpenRouter나 내 컴퓨터의 모델처럼 규칙이 느슨한 모델을 쓰세요.',
    ],
  'A reply stops halfway or comes back empty': [
    '回复写到一半停下或是空的',
    '回覆寫到一半停下或是空的',
    '返信が途中で止まる・空で返ってくる',
    '답장이 중간에 끊기거나 비어서 돌아올 때',
  ],
  'Raise Longest reply in the connection’s Advanced settings. Models that think first use part of it for their thinking.':
    [
      '在连接的高级设置中调高“最长回复”。先思考的模型会用掉其中一部分来思考。',
      '在連線的進階設定中調高「最長回覆」。先思考的模型會用掉其中一部分來思考。',
      '接続の詳細設定で「返信の最大長」を上げてください。先に考えるモデルは、その一部を考えるのに使います。',
      '연결의 고급 설정에서 최대 답장 길이를 늘리세요. 먼저 생각하는 모델은 그중 일부를 생각하는 데 씁니다.',
    ],
  '{diagnostics} checks the app and your connections, and can make a report to share that leaves out keys and story text. {report} in the footer puts that report with your own words, ready to copy or save.':
    [
      '{diagnostics}会检查应用和你的连接，并可生成一份不含密钥和故事文字的报告用于分享。页脚的{report}会把这份报告和你自己的描述放在一起，方便复制或保存。',
      '{diagnostics}會檢查應用程式和你的連線，並可產生一份不含金鑰和故事文字的報告用於分享。頁尾的{report}會把這份報告和你自己的描述放在一起，方便複製或儲存。',
      '{diagnostics}はアプリと接続を確認し、キーや物語の文章を含まない共有用レポートを作れます。フッターの{report}では、そのレポートに自分の言葉を添えて、コピーや保存ができます。',
      '{diagnostics}은 앱과 연결을 점검하고, 키와 이야기 글을 뺀 공유용 보고서를 만들 수 있습니다. 하단의 {report}는 그 보고서에 내 설명을 붙여 복사하거나 저장할 수 있게 해 줍니다.',
    ],
  'Step by step, every click: {service}': [
    '逐步说明，每一次点击：{service}',
    '逐步說明，每一次點擊：{service}',
    'ステップごとの手順（クリックひとつずつ）：{service}',
    '단계별 안내, 클릭 하나하나: {service}',
  ],
  'Choose {getKey} below. It opens {site} in your browser.': [
    '选择下方的{getKey}。它会在浏览器中打开 {site}。',
    '選擇下方的{getKey}。它會在瀏覽器中開啟 {site}。',
    '下の{getKey}を押します。ブラウザで {site} が開きます。',
    '아래의 {getKey}를 누르세요. 브라우저에서 {site}가 열립니다.',
  ],
  'Sign in, or make an account with your email or a Google account.': [
    '登录，或用电子邮箱或 Google 账户注册一个账户。',
    '登入，或用電子郵件或 Google 帳戶註冊一個帳戶。',
    'サインインするか、メールアドレスか Google アカウントでアカウントを作ります。',
    '로그인하거나, 이메일이나 Google 계정으로 계정을 만드세요.',
  ],
  'Add some credit: find Billing on the site and add a card, or buy credit ahead. US$5 lasts a few hundred replies on most recommended models.':
    [
      '充一点额度：在网站上找到“Billing”（账单），绑定银行卡或预先购买额度。用大多数推荐模型，5 美元够写几百条回复。',
      '儲值一點額度：在網站上找到「Billing」（帳單），綁定信用卡或預先購買額度。用大多數推薦模型，5 美元夠寫幾百則回覆。',
      'クレジットを入れます。サイトで Billing（請求）を開き、カードを登録するか前払いでクレジットを買います。おすすめのモデルの多くでは、5 米ドルで数百回の返信になります。',
      '크레딧을 넣으세요. 사이트에서 Billing(결제)을 찾아 카드를 등록하거나 크레딧을 미리 사면 됩니다. 추천 모델 대부분에서 5달러면 답장 수백 회입니다.',
    ],
  'Make a new key. The button says something like Create key or Create new secret key. Name it Dear to Love so you know later what it is for.':
    [
      '新建一个密钥。按钮通常叫 Create key 或 Create new secret key 之类。把它命名为 Dear to Love，以后就知道它是做什么用的。',
      '新增一個金鑰。按鈕通常叫 Create key 或 Create new secret key 之類。把它命名為 Dear to Love，以後就知道它是做什麼用的。',
      '新しいキーを作ります。ボタンは Create key や Create new secret key のような名前です。あとで用途がわかるよう、名前は Dear to Love にしましょう。',
      '새 키를 만드세요. 버튼 이름은 Create key나 Create new secret key 같은 식입니다. 나중에 용도를 알 수 있게 이름을 Dear to Love로 지으세요.',
    ],
  'Copy the key right away: most sites show it only once. Keep it private, like a password.': [
    '立刻复制密钥：大多数网站只显示一次。像密码一样保管好，不要外传。',
    '立刻複製金鑰：大多數網站只顯示一次。像密碼一樣保管好，不要外流。',
    'キーはすぐにコピーしてください。多くのサイトでは一度しか表示されません。パスワードと同じく、人に見せないでください。',
    '키는 바로 복사하세요. 대부분의 사이트는 한 번만 보여 줍니다. 비밀번호처럼 남에게 알리지 마세요.',
  ],
  'Back in Dear to Love, choose {setUp} below. It opens the form with the service and address filled in.':
    [
      '回到 Dear to Love，选择下方的{setUp}。它会打开一个已填好服务和地址的表单。',
      '回到 Dear to Love，選擇下方的{setUp}。它會開啟一個已填好服務和位址的表單。',
      'Dear to Love に戻り、下の{setUp}を押します。サービスとアドレスが入力済みのフォームが開きます。',
      'Dear to Love로 돌아와 아래의 {setUp}을 누르세요. 서비스와 주소가 채워진 양식이 열립니다.',
    ],
  'Paste the key into {apiKey}.': [
    '把密钥粘贴到{apiKey}中。',
    '把金鑰貼到{apiKey}中。',
    'キーを{apiKey}に貼り付けます。',
    '키를 {apiKey}에 붙여 넣으세요.',
  ],
  'Pick a model under {model}, for example {example}. Any name from the service’s model list works.':
    [
      '在{model}下选一个模型，例如 {example}。服务模型列表中的任何名称都可以。',
      '在{model}下選一個模型，例如 {example}。服務模型列表中的任何名稱都可以。',
      '{model}でモデルを選びます（例：{example}）。サービスのモデル一覧にある名前ならどれでも使えます。',
      '{model}에서 모델을 고르세요(예: {example}). 서비스 모델 목록에 있는 이름이면 무엇이든 됩니다.',
    ],
  'Type the model’s name under {model} as the program shows it. No key is needed.': [
    '在{model}中按程序显示的样子输入模型名称。不需要密钥。',
    '在{model}中按程式顯示的樣子輸入模型名稱。不需要金鑰。',
    '{model}に、プログラムに表示されているとおりのモデル名を入力します。キーは要りません。',
    '{model}에 프로그램에 표시된 그대로 모델 이름을 입력하세요. 키는 필요 없습니다.',
  ],
  'Choose {save}, then {test} beside the new connection. It checks the address, the key and the model, for free.':
    [
      '选择{save}，然后点新连接旁的{test}。它会免费检查地址、密钥和模型。',
      '選擇{save}，然後點新連線旁的{test}。它會免費檢查位址、金鑰和模型。',
      '{save}を押し、新しい接続の横の{test}を押します。アドレス、キー、モデルを無料で確認します。',
      '{save}을 누른 다음 새 연결 옆의 {test}를 누르세요. 주소, 키, 모델을 무료로 확인합니다.',
    ],
  'Start a story. Your first connection writes the replies; {send} shows one short sample first, for a fraction of a cent.':
    [
      '开始一个故事。你的第一个连接会负责写回复；{send}可以先花不到一美分看一段简短示例。',
      '開始一個故事。你的第一個連線會負責寫回覆；{send}可以先花不到一美分看一段簡短示例。',
      '物語を始めましょう。最初の接続が返信を書きます。{send}を使えば、1 セント未満で短いサンプルを先に見られます。',
      '이야기를 시작하세요. 첫 연결이 답장을 씁니다. {send}로 1센트도 안 되는 비용에 짧은 예시를 먼저 볼 수 있어요.',
    ],
  'Sites and programs rename their buttons now and then. If one is called something else, look for the closest match.':
    [
      '网站和程序时常会改按钮名称。如果名称不一样，找最接近的那个即可。',
      '網站和程式時常會改按鈕名稱。如果名稱不一樣，找最接近的那個即可。',
      'サイトやプログラムのボタン名はときどき変わります。名前が違うときは、いちばん近いものを探してください。',
      '사이트와 프로그램은 버튼 이름을 가끔 바꿉니다. 이름이 다르면 가장 비슷한 것을 찾으세요.',
    ],
  'If OpenAI answers that your organization must be verified, verify it in OpenAI’s settings (Organization, then General) and try again a few minutes later.':
    [
      '如果 OpenAI 回复说你的组织需要验证，请在 OpenAI 的设置中（Organization，然后 General）完成验证，几分钟后再试。',
      '如果 OpenAI 回覆說你的組織需要驗證，請在 OpenAI 的設定中（Organization，然後 General）完成驗證，幾分鐘後再試。',
      'OpenAI から組織の認証が必要と返ってきたら、OpenAI の設定（Organization → General）で認証し、数分後にもう一度試してください。',
      'OpenAI가 조직 인증이 필요하다고 답하면, OpenAI 설정(Organization → General)에서 인증한 뒤 몇 분 후 다시 시도하세요.',
    ],
  'Google AI Studio has a free tier with low daily limits, so you can try it before paying. Google may use what you send on the free tier to improve its products; set up billing in AI Studio to lift the limits.':
    [
      'Google AI Studio 有每日限额较低的免费层，可以先试用再付费。在免费层上，Google 可能会用你发送的内容改进其产品；在 AI Studio 中设置结算即可提高限额。',
      'Google AI Studio 有每日限額較低的免費方案，可以先試用再付費。在免費方案上，Google 可能會用你傳送的內容改善其產品；在 AI Studio 中設定帳單即可提高限額。',
      'Google AI Studio には 1 日の上限が低い無料枠があり、支払う前に試せます。無料枠では、送った内容が Google の製品改善に使われることがあります。AI Studio で請求を設定すると上限が上がります。',
      'Google AI Studio에는 하루 한도가 낮은 무료 등급이 있어 결제 전에 써 볼 수 있습니다. 무료 등급에서는 보낸 내용이 Google 제품 개선에 쓰일 수 있어요. AI Studio에서 결제를 설정하면 한도가 올라갑니다.',
    ],
  'Choose Get API key, then Create API key. Name it Dear to Love.': [
    '选择 Get API key，然后选择 Create API key。命名为 Dear to Love。',
    '選擇 Get API key，然後選擇 Create API key。命名為 Dear to Love。',
    'Get API key、続けて Create API key を押します。名前は Dear to Love にします。',
    'Get API key를 누른 다음 Create API key를 누르세요. 이름은 Dear to Love로 하세요.',
  ],
  'Buy a few dollars of credit on the Credits page. A few models are free, with low limits.': [
    '在 Credits 页面购买几美元的额度。少数模型免费，但限额较低。',
    '在 Credits 頁面購買幾美元的額度。少數模型免費，但限額較低。',
    'Credits のページで数ドル分のクレジットを買います。いくつかのモデルは無料ですが、上限は低めです。',
    'Credits 페이지에서 몇 달러어치 크레딧을 사세요. 일부 모델은 무료지만 한도가 낮습니다.',
  ],
  'Open Keys and choose Create Key. You can give the key its own spending limit there, which is a good idea.':
    [
      '打开 Keys，选择 Create Key。你可以在那里为这个密钥单独设置消费上限，建议这样做。',
      '開啟 Keys，選擇 Create Key。你可以在那裡為這個金鑰單獨設定消費上限，建議這樣做。',
      'Keys を開いて Create Key を押します。そこでキーごとに利用上限を設定できるので、設定しておくと安心です。',
      'Keys를 열고 Create Key를 누르세요. 거기서 키마다 지출 한도를 따로 정할 수 있으니 설정해 두는 게 좋습니다.',
    ],
  'Each model’s page on OpenRouter shows its price, its content rules and the exact name to type.':
    [
      'OpenRouter 上每个模型的页面都会显示其价格、内容规则以及要输入的准确名称。',
      'OpenRouter 上每個模型的頁面都會顯示其價格、內容規則以及要輸入的準確名稱。',
      'OpenRouter の各モデルのページには、料金、内容のルール、入力する正確な名前が載っています。',
      'OpenRouter의 각 모델 페이지에는 가격, 콘텐츠 규칙, 입력할 정확한 이름이 나와 있습니다.',
    ],
  'Open Access Tokens and create a new fine-grained token that may make calls to Inference Providers. Name it Dear to Love.':
    [
      '打开 Access Tokens，新建一个可调用 Inference Providers 的细粒度令牌。命名为 Dear to Love。',
      '開啟 Access Tokens，新增一個可呼叫 Inference Providers 的細粒度權杖。命名為 Dear to Love。',
      'Access Tokens を開き、Inference Providers を呼び出せる fine-grained トークンを新しく作ります。名前は Dear to Love にします。',
      'Access Tokens를 열고 Inference Providers를 호출할 수 있는 fine-grained 토큰을 새로 만드세요. 이름은 Dear to Love로 하세요.',
    ],
  'Choose {download} below and install Ollama. Open it once; after that it runs quietly in the background.':
    [
      '选择下方的{download}并安装 Ollama。打开一次，之后它会在后台安静运行。',
      '選擇下方的{download}並安裝 Ollama。開啟一次，之後它會在背景安靜執行。',
      '下の{download}を押して Ollama をインストールします。一度開けば、あとはバックグラウンドで静かに動きます。',
      '아래의 {download}를 눌러 Ollama를 설치하세요. 한 번 열어 두면 그 뒤로는 백그라운드에서 조용히 실행됩니다.',
    ],
  'Open a terminal. On Windows, press Start, type Terminal and press Enter. On a Mac, press Cmd+Space, type Terminal and press Enter.':
    [
      '打开终端。在 Windows 上，按“开始”，输入 Terminal 并按回车。在 Mac 上，按 Cmd+空格，输入 Terminal 并按回车。',
      '開啟終端機。在 Windows 上，按「開始」，輸入 Terminal 並按 Enter。在 Mac 上，按 Cmd+空白鍵，輸入 Terminal 並按 Enter。',
      'ターミナルを開きます。Windows ではスタートを押し、Terminal と入力して Enter。Mac では Cmd+Space を押し、Terminal と入力して Enter を押します。',
      '터미널을 여세요. Windows에서는 시작을 누르고 Terminal을 입력한 뒤 Enter, Mac에서는 Cmd+Space를 누르고 Terminal을 입력한 뒤 Enter를 누르세요.',
    ],
  'Type this and press Enter. The model is several GB, so it takes a few minutes:': [
    '输入下面这行并按回车。模型有好几 GB，需要几分钟：',
    '輸入下面這行並按 Enter。模型有好幾 GB，需要幾分鐘：',
    '次のように入力して Enter を押します。モデルは数 GB あるので、数分かかります：',
    '아래를 입력하고 Enter를 누르세요. 모델이 몇 GB라서 몇 분 걸립니다:',
  ],
  'Not much memory? {small} runs on computers with 8 GB. With a graphics card that has 24 GB, {large} writes much better.':
    [
      '内存不多？{small} 在 8 GB 的电脑上就能运行。如果显卡有 24 GB 显存，{large} 写得好得多。',
      '記憶體不多？{small} 在 8 GB 的電腦上就能執行。如果顯示卡有 24 GB 顯示記憶體，{large} 寫得好得多。',
      'メモリが少なめなら、{small} は 8 GB のパソコンでも動きます。24 GB のグラフィックカードがあれば、{large} のほうがずっと上手に書きます。',
      '메모리가 적다면 {small}는 8 GB 컴퓨터에서도 돌아갑니다. 24 GB 그래픽카드가 있다면 {large}가 훨씬 잘 씁니다.',
    ],
  'Choose {download} below, install LM Studio and open it.': [
    '选择下方的{download}，安装 LM Studio 并打开它。',
    '選擇下方的{download}，安裝 LM Studio 並開啟它。',
    '下の{download}を押し、LM Studio をインストールして開きます。',
    '아래의 {download}를 눌러 LM Studio를 설치하고 여세요.',
  ],
  'Find a model in its Discover tab (the magnifying glass), such as Gemma 4 12B, and download it.':
    [
      '在 Discover 标签页（放大镜图标）中找一个模型，例如 Gemma 4 12B，然后下载。',
      '在 Discover 分頁（放大鏡圖示）中找一個模型，例如 Gemma 4 12B，然後下載。',
      'Discover タブ（虫めがね）で Gemma 4 12B などのモデルを探してダウンロードします。',
      'Discover 탭(돋보기)에서 Gemma 4 12B 같은 모델을 찾아 내려받으세요.',
    ],
  'In the Developer tab, load the model with a context length of 8192 or more, then switch the server on.':
    [
      '在 Developer 标签页中，以 8192 或更大的上下文长度加载模型，然后开启服务器。',
      '在 Developer 分頁中，以 8192 或更大的上下文長度載入模型，然後開啟伺服器。',
      'Developer タブで、コンテキスト長を 8192 以上にしてモデルを読み込み、サーバーをオンにします。',
      'Developer 탭에서 컨텍스트 길이를 8192 이상으로 해서 모델을 불러온 뒤 서버를 켜세요.',
    ],
  'Set {context} under Advanced to the context length the model was loaded with, so long stories fit.':
    [
      '把高级设置中的{context}设成模型加载时的上下文长度，这样长故事也放得下。',
      '把進階設定中的{context}設成模型載入時的上下文長度，這樣長故事也放得下。',
      '長い物語が収まるよう、詳細設定の{context}をモデルを読み込んだときのコンテキスト長に合わせます。',
      '긴 이야기가 들어가도록 고급 설정의 {context}를 모델을 불러올 때의 컨텍스트 길이에 맞추세요.',
    ],
  'Already have an OpenAI key for stories? The same key works: skip to pasting it.': [
    '已经有用于故事的 OpenAI 密钥？同一个密钥就能用：直接跳到粘贴那一步。',
    '已經有用於故事的 OpenAI 金鑰？同一個金鑰就能用：直接跳到貼上那一步。',
    '物語用の OpenAI キーがもうある？同じキーが使えるので、貼り付けの手順まで飛ばしてかまいません。',
    '이야기용 OpenAI 키가 이미 있나요? 같은 키를 쓸 수 있으니 붙여 넣는 단계로 건너뛰세요.',
  ],
  'Settings → Pictures chooses which connection makes pictures, or none.': [
    '在“设置 → 图片”中选择由哪个连接生成图片，或不使用。',
    '在「設定 → 圖片」中選擇由哪個連線產生圖片，或不使用。',
    'どの接続で画像を作るか（または作らないか）は、設定 → 画像で選びます。',
    '설정 → 이미지에서 어떤 연결이 이미지를 만들지, 또는 안 만들지 고릅니다.',
  ],
  'Best place to start': ['最适合起步', '最適合起步', '最初の一歩に', '처음 시작하기에 가장 좋음'],
  'Clear, natural stories, written quickly. The same key makes portraits and item pictures.': [
    '故事清晰自然，写得也快。同一个密钥还能生成肖像和物品图片。',
    '故事清晰自然，寫得也快。同一個金鑰還能產生肖像和物品圖片。',
    'わかりやすく自然な物語を、すばやく書きます。同じキーで肖像画やアイテムの画像も作れます。',
    '명확하고 자연스러운 이야기를 빠르게 씁니다. 같은 키로 초상화와 아이템 그림도 만들 수 있어요.',
  ],
  'Keeps characters, threads and tone straight over long stories. Claude Opus 5.5 is stronger still, at about twice the price.':
    [
      '在长故事中也能保持角色、线索和基调一致。Claude Opus 5.5 更强，价格大约是两倍。',
      '在長故事中也能保持角色、線索和基調一致。Claude Opus 5.5 更強，價格大約是兩倍。',
      '長い物語でも登場人物、伏線、雰囲気がぶれません。Claude Opus 5.5 はさらに強力で、料金はおよそ 2 倍です。',
      '긴 이야기에서도 인물, 줄거리, 분위기를 일관되게 유지합니다. Claude Opus 5.5는 더 뛰어나고 가격은 약 두 배입니다.',
    ],
  'Cheap and good': ['便宜又好用', '便宜又好用', '安くて優秀', '저렴하고 좋음'],
  'Quick and capable, and Google has a free tier to try it first.': [
    '快速又能干，而且 Google 提供免费层可以先试用。',
    '快速又能幹，而且 Google 提供免費方案可以先試用。',
    '速くて有能です。Google には先に試せる無料枠もあります。',
    '빠르고 유능하며, Google에는 먼저 써 볼 수 있는 무료 등급도 있습니다.',
  ],
  'Many models, looser rules': [
    '模型多，规则宽松',
    '模型多，規則寬鬆',
    'モデルが豊富、ルールが緩め',
    '모델이 많고 규칙이 느슨함',
  ],
  'One key for hundreds of models, including open ones with looser content rules. A favourite for roleplay.':
    [
      '一个密钥就能用数百个模型，其中包括内容规则更宽松的开放模型。是角色扮演的热门之选。',
      '一個金鑰就能用數百個模型，其中包括內容規則更寬鬆的開放模型。是角色扮演的熱門之選。',
      'ひとつのキーで数百のモデルが使え、内容のルールが緩めのオープンなモデルもあります。ロールプレイで人気です。',
      '키 하나로 수백 개 모델을 쓸 수 있고, 콘텐츠 규칙이 느슨한 오픈 모델도 있습니다. 롤플레이에서 인기가 많아요.',
    ],
  'Runs on your own computer with about 16 GB of memory. Nothing leaves it.': [
    '在你自己的电脑上运行，需要约 16 GB 内存。任何内容都不会离开电脑。',
    '在你自己的電腦上執行，需要約 16 GB 記憶體。任何內容都不會離開電腦。',
    '16 GB ほどのメモリがあれば自分のパソコンで動きます。何も外に出ません。',
    '메모리 16 GB 정도면 내 컴퓨터에서 돌아갑니다. 아무것도 밖으로 나가지 않아요.',
  ],
  "Uses Anthropic's own Messages API. Claude picks its own temperature, so that setting is not sent.":
    [
      '使用 Anthropic 自己的 Messages API。Claude 会自行选择温度，所以不会发送这个设置。',
      '使用 Anthropic 自己的 Messages API。Claude 會自行選擇溫度，所以不會傳送這個設定。',
      'Anthropic 独自の Messages API を使います。Claude は温度を自分で決めるので、その設定は送りません。',
      'Anthropic 자체 Messages API를 씁니다. Claude는 온도를 스스로 정하므로 그 설정은 보내지 않습니다.',
    ],
  'Most current models from OpenAI, Anthropic, Google and xAI think before they write. For them the app asks for brief thinking and allows 2,000 more tokens for it, which usage and the budget count, and leaves out the temperature where the model keeps its own.':
    [
      'OpenAI、Anthropic、Google 和 xAI 的大多数现有模型会先思考再写作。对这些模型，应用会要求简短思考并为此多留 2,000 个 token（用量和预算会计入），在模型坚持使用自己的温度时也不发送温度。',
      'OpenAI、Anthropic、Google 和 xAI 的大多數現有模型會先思考再寫作。對這些模型，應用程式會要求簡短思考並為此多留 2,000 個 token（用量和預算會計入），在模型堅持使用自己的溫度時也不傳送溫度。',
      'OpenAI、Anthropic、Google、xAI の現行モデルの多くは、書く前に考えます。それらには短く考えるよう頼み、そのために 2,000 トークン多く確保します（使用量と予算に含まれます）。温度を自分で決めるモデルには温度を送りません。',
      'OpenAI, Anthropic, Google, xAI의 현재 모델 대부분은 쓰기 전에 생각합니다. 이런 모델에는 짧게 생각하도록 요청하고 그만큼 2,000토큰을 더 허용하며(사용량과 예산에 포함), 온도를 스스로 정하는 모델에는 온도를 보내지 않습니다.',
    ],
  'Suggested models': ['推荐模型', '推薦模型', 'おすすめのモデル', '추천 모델'],
  'November 2026': ['2026 年 11 月', '2026 年 11 月', '2026 年 11 月', '2026년 11월'],
  'all-round, quick': ['全面、快速', '全面、快速', '万能で速い', '두루 좋고 빠름'],
  'stronger plots': ['情节更强', '情節更強', 'より良い筋書き', '더 탄탄한 줄거리'],
  'the most capable, costs the most': [
    '能力最强，也最贵',
    '能力最強，也最貴',
    '最も高性能、最も高価',
    '가장 뛰어나고 가장 비쌈',
  ],
  cheapest: ['最便宜', '最便宜', '最安', '가장 저렴'],
  'cheap and good': ['便宜又好', '便宜又好', '安くて優秀', '저렴하고 좋음'],
  'long stories that stay consistent': [
    '长故事也能保持一致',
    '長故事也能保持一致',
    '長い物語でもぶれない',
    '긴 이야기도 일관됨',
  ],
  'the best at long, careful stories': [
    '最擅长细致的长故事',
    '最擅長細緻的長故事',
    '長く丁寧な物語が最も得意',
    '길고 섬세한 이야기에 최고',
  ],
  'the previous Flash': ['上一代 Flash', '上一代 Flash', 'ひとつ前の Flash', '이전 세대 Flash'],
  'the strongest Gemini; paid accounts only': [
    '最强的 Gemini；仅限付费账户',
    '最強的 Gemini；僅限付費帳戶',
    '最強の Gemini。有料アカウントのみ',
    '가장 강력한 Gemini, 유료 계정 전용',
  ],
  'popular for roleplay, cheap': [
    '角色扮演热门，便宜',
    '角色扮演熱門，便宜',
    'ロールプレイで人気、安い',
    '롤플레이 인기, 저렴',
  ],
  'good stories; about 10 GB of memory': [
    '故事不错；约 10 GB 内存',
    '故事不錯；約 10 GB 記憶體',
    '良い物語。メモリ約 10 GB',
    '좋은 이야기, 메모리 약 10 GB',
  ],
  'for computers with 8 GB': [
    '适合 8 GB 内存的电脑',
    '適合 8 GB 記憶體的電腦',
    '8 GB のパソコン向け',
    '8 GB 컴퓨터용',
  ],
  'runs almost anywhere; simple stories': [
    '几乎哪里都能跑；故事较简单',
    '幾乎哪裡都能跑；故事較簡單',
    'ほぼどこでも動く。物語はシンプル',
    '거의 어디서나 실행, 이야기는 단순',
  ],
  'much better; a graphics card with 24 GB': [
    '好得多；需要 24 GB 显卡',
    '好得多；需要 24 GB 顯示卡',
    'ずっと上手。24 GB のグラフィックカードが必要',
    '훨씬 좋음, 24 GB 그래픽카드 필요',
  ],
  'fewer refusals for dark fiction': [
    '黑暗题材更少拒绝',
    '黑暗題材更少拒絕',
    'ダークな物語でも断りにくい',
    '어두운 소설도 덜 거절함',
  ],
  'Filled in from the prices this app lists, checked {checked}. Check them against the service’s pricing page, then save.':
    [
      '已按本应用列出的价格填好（核对于 {checked}）。请对照服务的定价页面确认后再保存。',
      '已按本應用程式列出的價格填好（核對於 {checked}）。請對照服務的定價頁面確認後再儲存。',
      'このアプリに載っている料金（{checked}時点で確認）で入力しました。サービスの料金ページと見比べてから保存してください。',
      '이 앱에 나온 가격({checked} 기준 확인)으로 채웠습니다. 서비스 요금 페이지와 비교한 뒤 저장하세요.',
    ],
  'Set up': ['设置', '設定', '設定する', '설정'],
  Forest: ['森林', '森林', 'フォレスト', '포레스트'],
  Ocean: ['海洋', '海洋', 'オーシャン', '오션'],
  Lavender: ['薰衣草', '薰衣草', 'ラベンダー', '라벤더'],
  Ember: ['余烬', '餘燼', 'エンバー', '엠버'],
  Terminal: ['终端', '終端機', 'ターミナル', '터미널'],
  Ink: ['墨', '墨', 'インク', '잉크'],
  'Pine green and gold, for woodland and nature stories.': [
    '松绿与金色，适合森林和自然题材的故事。',
    '松綠與金色，適合森林和自然題材的故事。',
    '松の緑と金色。森や自然の物語に。',
    '소나무 초록과 금색. 숲과 자연 이야기에 어울립니다.',
  ],
  'Sea glass and sand, for summers, islands and the sea.': [
    '海玻璃与沙滩色，适合夏日、海岛和大海的故事。',
    '海玻璃與沙灘色，適合夏日、海島和大海的故事。',
    'シーグラスと砂の色。夏や島、海の物語に。',
    '바다 유리와 모래 색. 여름, 섬, 바다 이야기에 어울립니다.',
  ],
  'Soft lilac and violet, for dreamy and whimsical stories.': [
    '柔和的淡紫与紫罗兰色，适合梦幻、奇趣的故事。',
    '柔和的淡紫與紫羅蘭色，適合夢幻、奇趣的故事。',
    'やわらかなライラックとすみれ色。夢のような、不思議な物語に。',
    '부드러운 라일락과 보라색. 몽환적이고 기발한 이야기에 어울립니다.',
  ],
  'Soot and firelight orange, for action, war and heroes.': [
    '煤黑与火光橙，适合动作、战争和英雄故事。',
    '煤黑與火光橙，適合動作、戰爭和英雄故事。',
    'すすの黒と炎のオレンジ。アクション、戦い、ヒーローの物語に。',
    '그을음 검정과 불빛 주황. 액션, 전쟁, 영웅 이야기에 어울립니다.',
  ],
  'Green on black in a typewriter face, for text adventures.': [
    '黑底绿字，打字机字体，适合文字冒险。',
    '黑底綠字，打字機字體，適合文字冒險。',
    '黒地に緑のタイプライター書体。テキストアドベンチャーに。',
    '검은 바탕에 초록 타자기 글꼴. 텍스트 어드벤처에 어울립니다.',
  ],
  'Black on white with the strongest contrast, for easy reading.': [
    '白底黑字，对比度最高，读起来最轻松。',
    '白底黑字，對比度最高，讀起來最輕鬆。',
    '白地に黒、いちばん高いコントラストで読みやすく。',
    '흰 바탕에 검은 글씨, 가장 높은 대비로 읽기 쉽습니다.',
  ],
  'Dear to Love voice pack': [
    'Dear to Love 语音包',
    'Dear to Love 語音包',
    'Dear to Love ボイスパック',
    'Dear to Love 보이스 팩',
  ],
  'Save voice pack': ['保存语音包', '儲存語音包', 'ボイスパックを保存', '보이스 팩 저장'],
  'Import voice pack': ['导入语音包', '匯入語音包', 'ボイスパックを読み込む', '보이스 팩 가져오기'],
  'Choose a voice connection for the voice pack {name} in Settings, under Sound.': [
    '请在“设置”的“声音”中为语音包 {name} 选择一个语音连接。',
    '請在「設定」的「聲音」中為語音包 {name} 選擇一個語音連線。',
    '設定の「サウンド」で、ボイスパック {name} に使う音声の接続を選んでください。',
    '설정의 소리에서 보이스 팩 {name}에 쓸 음성 연결을 고르세요.',
  ],
  'Your budget pauses requests it can’t price, and the app can’t price AI voices. Read this reply aloud anyway, or use the computer’s voices.':
    [
      '你的预算会暂停无法计价的请求，而本应用无法为 AI 语音计价。你可以仍然朗读这条回复，或改用电脑自带的语音。',
      '你的預算會暫停無法計價的請求，而本應用程式無法為 AI 語音計價。你可以仍然朗讀這則回覆，或改用電腦內建的語音。',
      '予算の設定で、料金を見積もれないリクエストは止まります。AI 音声の料金はアプリでは見積もれません。それでも読み上げるか、コンピューターの音声を使ってください。',
      '예산 설정은 가격을 알 수 없는 요청을 멈춥니다. 앱은 AI 음성의 가격을 알 수 없습니다. 그래도 읽거나, 컴퓨터 음성을 쓰세요.',
    ],
  'Could not read this aloud: {reason}': [
    '无法朗读：{reason}',
    '無法朗讀：{reason}',
    '読み上げられませんでした：{reason}',
    '소리 내어 읽지 못했습니다: {reason}',
  ],
  'Turn sound off': ['关闭声音', '關閉聲音', 'サウンドをオフにする', '소리 끄기'],
  'Turn sound on': ['打开声音', '開啟聲音', 'サウンドをオンにする', '소리 켜기'],
  'mute silent chime read aloud voices': [
    '静音 无声 提示音 朗读 语音',
    '靜音 無聲 提示音 朗讀 語音',
    'ミュート 消音 チャイム 読み上げ 音声',
    '음소거 무음 알림음 읽기 음성',
  ],
  'Voices (optional)': ['语音（可选）', '語音（選用）', '音声（任意）', '음성(선택)'],
  'API key, paid per character read': [
    'API 密钥，按朗读的字数计费',
    'API 金鑰，按朗讀的字數計費',
    'API キー、読み上げた文字数で課金',
    'API 키, 읽은 글자 수만큼 요금',
  ],
  'Replies can be read aloud with the computer’s own voices, for free. For AI voices (a narrator and a voice for each character, including voices you clone), connect a voice service and make a voice pack in Settings → Sound. Sound can be turned off there too.':
    [
      '回复可以用电脑自带的语音免费朗读。想用 AI 语音（一个旁白，再给每个角色一个声音，包括你克隆的声音），请连接一个语音服务，并在“设置 → 声音”中制作语音包。声音也可以在那里关闭。',
      '回覆可以用電腦內建的語音免費朗讀。想用 AI 語音（一個旁白，再給每個角色一個聲音，包括你複製的聲音），請連線一個語音服務，並在「設定 → 聲音」中製作語音包。聲音也可以在那裡關閉。',
      '返信はコンピューターの音声で無料で読み上げられます。AI 音声（ナレーターと、キャラクターごとの声。自分でクローンした声も使えます）を使うには、音声サービスを接続し、設定 → サウンドでボイスパックを作ります。サウンドはそこでオフにもできます。',
      '답장은 컴퓨터 음성으로 무료로 읽을 수 있습니다. AI 음성(내레이터와 캐릭터마다 다른 목소리, 직접 복제한 목소리도 가능)을 쓰려면 음성 서비스를 연결하고 설정 → 소리에서 보이스 팩을 만드세요. 소리는 그곳에서 끌 수도 있습니다.',
    ],
  'Only the text being read is sent to the voice service. A voice pack can be saved to a file and shared; it names the voices only, never your key.':
    [
      '只有正在朗读的文字会发送给语音服务。语音包可以保存成文件分享；文件里只写明用哪些声音，绝不包含你的密钥。',
      '只有正在朗讀的文字會傳送給語音服務。語音包可以儲存成檔案分享；檔案裡只寫明用哪些聲音，絕不包含你的金鑰。',
      '音声サービスに送られるのは、読み上げる文章だけです。ボイスパックはファイルに保存して共有できます。中身は声の名前だけで、キーは含まれません。',
      '음성 서비스로는 읽는 글만 보냅니다. 보이스 팩은 파일로 저장해 공유할 수 있고, 목소리 이름만 담기며 키는 절대 들어가지 않습니다.',
    ],
  'ElevenLabs charges by the character read, with a small free allowance each month. Voices you design or clone there, and ones you add from its voice library, all appear in a voice pack.':
    [
      'ElevenLabs 按朗读的字数收费，每月有少量免费额度。你在那里设计或克隆的声音，以及从它的声音库添加的声音，都会出现在语音包里。',
      'ElevenLabs 按朗讀的字數收費，每月有少量免費額度。你在那裡設計或複製的聲音，以及從它的聲音庫加入的聲音，都會出現在語音包裡。',
      'ElevenLabs は読み上げた文字数で課金され、毎月少しの無料枠があります。そこで作った声やクローンした声、ボイスライブラリから追加した声は、すべてボイスパックで選べます。',
      'ElevenLabs는 읽은 글자 수로 요금을 매기며, 매달 조금의 무료 사용량이 있습니다. 그곳에서 만들거나 복제한 목소리, 보이스 라이브러리에서 추가한 목소리 모두 보이스 팩에 나옵니다.',
    ],
  'Settings → Sound → New voice pack: choose this connection, then a voice for the narrator and for each character.':
    [
      '设置 → 声音 → 新建语音包：选择这个连接，然后为旁白和每个角色选择声音。',
      '設定 → 聲音 → 新增語音包：選擇這個連線，然後為旁白和每個角色選擇聲音。',
      '設定 → サウンド → 新しいボイスパック：この接続を選び、ナレーターと各キャラクターの声を選びます。',
      '설정 → 소리 → 새 보이스 팩: 이 연결을 고르고, 내레이터와 캐릭터마다 목소리를 고르세요.',
    ],
  'Voice library': ['声音库', '聲音庫', 'ボイスライブラリ', '보이스 라이브러리'],
  'Install Docker, then start Kokoro-FastAPI with this command:': [
    '安装 Docker，然后用这条命令启动 Kokoro-FastAPI：',
    '安裝 Docker，然後用這條指令啟動 Kokoro-FastAPI：',
    'Docker をインストールし、次のコマンドで Kokoro-FastAPI を起動します：',
    'Docker를 설치한 다음, 이 명령으로 Kokoro-FastAPI를 시작하세요:',
  ],
  'Leave it running; its voices are free and stay on this computer.': [
    '让它一直运行；它的声音免费，而且只在这台电脑上。',
    '讓它一直執行；它的聲音免費，而且只在這台電腦上。',
    '起動したままにします。声は無料で、このコンピューターの中だけで使われます。',
    '계속 실행해 두세요. 목소리는 무료이고 이 컴퓨터 안에만 있습니다.',
  ],
  'Choose Set it up here, then make a voice pack with it in Settings → Sound.': [
    '选择“在这里设置”，然后在“设置 → 声音”中用它制作语音包。',
    '選擇「在這裡設定」，然後在「設定 → 聲音」中用它製作語音包。',
    '「ここで設定する」を選び、設定 → サウンドでそれを使ったボイスパックを作ります。',
    '여기서 설정을 고른 다음, 설정 → 소리에서 이 연결로 보이스 팩을 만드세요.',
  ],
  'Read aloud anyway': ['仍然朗读', '仍然朗讀', 'それでも読み上げる', '그래도 읽기'],
  'ElevenLabs (voices)': [
    'ElevenLabs（语音）',
    'ElevenLabs（語音）',
    'ElevenLabs（音声）',
    'ElevenLabs(음성)',
  ],
  'Voice server, OpenAI-style (voices)': [
    '语音服务器，OpenAI 风格（语音）',
    '語音伺服器，OpenAI 風格（語音）',
    '音声サーバー、OpenAI 形式（音声）',
    '음성 서버, OpenAI 방식(음성)',
  ],
  'Reads replies aloud in AI voices. It never writes story replies; choose it in a voice pack in Settings, under Sound.':
    [
      '用 AI 语音朗读回复。它不会写故事回复；请在“设置”的“声音”中，把它选进语音包。',
      '用 AI 語音朗讀回覆。它不會寫故事回覆；請在「設定」的「聲音」中，把它選進語音包。',
      '返信を AI 音声で読み上げます。物語の返信は書きません。設定の「サウンド」で、ボイスパックに選んでください。',
      '답장을 AI 음성으로 읽어 줍니다. 이야기 답장은 쓰지 않습니다. 설정의 소리에서 보이스 팩에 고르세요.',
    ],
  'Paid API (each reading is recorded; the app can’t price voices)': [
    '付费 API（每次朗读都会记录；本应用无法为语音计价）',
    '付費 API（每次朗讀都會記錄；本應用程式無法為語音計價）',
    '有料 API（読み上げはすべて記録されます。音声の料金はアプリでは見積もれません）',
    '유료 API(읽을 때마다 기록되며, 앱은 음성 가격을 알 수 없음)',
  ],
  'The bell over the door rings. "You came back," {name} says.': [
    '门上的铃响了。“你回来了。”{name} 说。',
    '門上的鈴響了。「你回來了。」{name} 說。',
    'ドアのベルが鳴る。「戻ってきたのね」と {name} が言う。',
    '문 위의 종이 울린다. "돌아왔구나." {name}이(가) 말한다.',
  ],
  'Sound on': ['声音开启', '聲音開啟', 'サウンドをオン', '소리 켜짐'],
  'Turn it off for a silent app: no chime, and nothing is read aloud.': [
    '关闭后应用完全安静：没有提示音，也不会朗读任何内容。',
    '關閉後應用程式完全安靜：沒有提示音，也不會朗讀任何內容。',
    'オフにするとアプリは無音になります。チャイムも読み上げもありません。',
    '끄면 앱이 조용해집니다. 알림음도 없고 아무것도 읽지 않습니다.',
  ],
  'Sound is off. Nothing plays and no voice is asked for until you turn it on.': [
    '声音已关闭。在你重新打开之前，什么都不会播放，也不会请求任何语音。',
    '聲音已關閉。在你重新開啟之前，什麼都不會播放，也不會請求任何語音。',
    'サウンドはオフです。オンにするまで何も鳴らず、音声も頼みません。',
    '소리가 꺼져 있습니다. 다시 켤 때까지 아무것도 재생하지 않고 음성도 요청하지 않습니다.',
  ],
  'Imported {name}. Its voices are AI voices: edit it and choose your voice connection.': [
    '已导入 {name}。它用的是 AI 语音：请编辑它并选择你的语音连接。',
    '已匯入 {name}。它用的是 AI 語音：請編輯它並選擇你的語音連線。',
    '{name} を読み込みました。AI 音声のパックなので、編集して自分の音声の接続を選んでください。',
    '{name}을(를) 가져왔습니다. AI 음성을 쓰는 팩이니, 편집해서 음성 연결을 고르세요.',
  ],
  'Imported {name}, and replies are read with it now.': [
    '已导入 {name}，现在用它朗读回复。',
    '已匯入 {name}，現在用它朗讀回覆。',
    '{name} を読み込みました。これからはこのパックで読み上げます。',
    '{name}을(를) 가져왔습니다. 이제 이 팩으로 답장을 읽습니다.',
  ],
  'Saved {name}. The file names the voices only: no keys and no connections.': [
    '已保存 {name}。文件里只写明用哪些声音：没有密钥，也没有连接。',
    '已儲存 {name}。檔案裡只寫明用哪些聲音：沒有金鑰，也沒有連線。',
    '{name} を保存しました。ファイルには声の名前だけが入り、キーも接続も含まれません。',
    '{name}을(를) 저장했습니다. 파일에는 목소리 이름만 있고 키나 연결은 없습니다.',
  ],
  'The speaker under a reply reads it aloud. A voice pack gives the narrator and each character a voice of their own, from this computer or from an AI voice service such as ElevenLabs, with your own or cloned voices.':
    [
      '回复下方的扬声器按钮会朗读回复。语音包能给旁白和每个角色各自的声音，可以来自这台电脑，也可以来自 ElevenLabs 等 AI 语音服务，包括你自己的或克隆的声音。',
      '回覆下方的喇叭按鈕會朗讀回覆。語音包能給旁白和每個角色各自的聲音，可以來自這台電腦，也可以來自 ElevenLabs 等 AI 語音服務，包括你自己的或複製的聲音。',
      '返信の下のスピーカーで読み上げます。ボイスパックを使うと、ナレーターと各キャラクターに専用の声を付けられます。声はこのコンピューターのもの、または ElevenLabs などの AI 音声サービスのもの（自分の声やクローンした声も）から選べます。',
      '답장 아래의 스피커 버튼으로 소리 내어 읽습니다. 보이스 팩은 내레이터와 캐릭터마다 다른 목소리를 줍니다. 이 컴퓨터의 목소리나 ElevenLabs 같은 AI 음성 서비스의 목소리(직접 만들거나 복제한 목소리 포함)를 쓸 수 있습니다.',
    ],
  Voices: ['声音', '聲音', '音声', '목소리'],
  'One computer voice for everything': [
    '全部用同一个电脑语音',
    '全部用同一個電腦語音',
    'すべてコンピューターの 1 つの声で',
    '모두 컴퓨터 목소리 하나로',
  ],
  'Voice pack: {name}': [
    '语音包：{name}',
    '語音包：{name}',
    'ボイスパック：{name}',
    '보이스 팩: {name}',
  ],
  'This computer has no voices the app can use. A voice pack with AI voices can still read replies aloud.':
    [
      '这台电脑没有应用可用的语音。使用 AI 语音的语音包仍然可以朗读回复。',
      '這台電腦沒有應用程式可用的語音。使用 AI 語音的語音包仍然可以朗讀回覆。',
      'このコンピューターにはアプリが使える音声がありません。AI 音声のボイスパックなら読み上げられます。',
      '이 컴퓨터에는 앱이 쓸 수 있는 음성이 없습니다. AI 음성을 쓰는 보이스 팩으로는 읽을 수 있습니다.',
    ],
  'New voice pack': ['新建语音包', '新增語音包', '新しいボイスパック', '새 보이스 팩'],
  'Import voice pack…': [
    '导入语音包…',
    '匯入語音包…',
    'ボイスパックを読み込む…',
    '보이스 팩 가져오기…',
  ],
  '{name} (copy)': ['{name}（副本）', '{name}（副本）', '{name}（コピー）', '{name} (사본)'],
  Duplicate: ['复制一份', '複製一份', '複製', '복제'],
  'Save to a file…': ['保存为文件…', '儲存為檔案…', 'ファイルに保存…', '파일로 저장…'],
  'Delete voice pack?': [
    '删除语音包？',
    '刪除語音包？',
    'ボイスパックを削除しますか？',
    '보이스 팩을 삭제할까요?',
  ],
  '{name} is removed from this computer. Replies are read with one computer voice again. A file you saved it to is kept.':
    [
      '{name} 会从这台电脑上移除，回复会重新用一个电脑语音朗读。你保存过的文件不受影响。',
      '{name} 會從這台電腦上移除，回覆會重新用一個電腦語音朗讀。你儲存過的檔案不受影響。',
      '{name} をこのコンピューターから削除し、読み上げはコンピューターの 1 つの声に戻ります。保存したファイルは残ります。',
      '{name}을(를) 이 컴퓨터에서 지우고, 답장은 다시 컴퓨터 목소리 하나로 읽습니다. 저장해 둔 파일은 남습니다.',
    ],
  'Narrator: {voice}.': [
    '旁白：{voice}。',
    '旁白：{voice}。',
    'ナレーター：{voice}。',
    '내레이터: {voice}.',
  ],
  'Narrator: the usual voice.': [
    '旁白：默认声音。',
    '旁白：預設聲音。',
    'ナレーター：いつもの声。',
    '내레이터: 기본 목소리.',
  ],
  'AI voices from {name}; each reading is recorded in Usage.': [
    'AI 语音来自 {name}；每次朗读都会记录在“用量”中。',
    'AI 語音來自 {name}；每次朗讀都會記錄在「用量」中。',
    'AI 音声は {name} から。読み上げはすべて「使用量」に記録されます。',
    'AI 음성은 {name}에서 옵니다. 읽을 때마다 사용량에 기록됩니다.',
  ],
  'Choose a voice connection for it with Edit.': [
    '点“编辑”为它选择语音连接。',
    '點「編輯」為它選擇語音連線。',
    '「編集」から音声の接続を選んでください。',
    '편집에서 음성 연결을 고르세요.',
  ],
  'The computer’s own voices: free and offline.': [
    '电脑自带的语音：免费，离线可用。',
    '電腦內建的語音：免費，離線可用。',
    'コンピューターの音声：無料でオフラインでも使えます。',
    '컴퓨터 목소리: 무료이고 오프라인에서도 됩니다.',
  ],
  'The computer’s own voices read replies aloud, so it works offline and costs nothing.': [
    '用电脑自带的语音朗读回复，所以离线也能用，而且不花钱。',
    '用電腦內建的語音朗讀回覆，所以離線也能用，而且不花錢。',
    'コンピューターの音声で返信を読み上げます。オフラインでも使え、費用はかかりません。',
    '컴퓨터 목소리로 답장을 읽어서 오프라인에서도 되고 비용도 들지 않습니다.',
  ],
  '{n} characters have voices of their own.': [
    '{n} 个角色有自己的声音。',
    '{n} 個角色有自己的聲音。',
    '{n} 人のキャラクターに専用の声があります。',
    '캐릭터 {n}명에게 자기 목소리가 있습니다.',
  ],
  'The narrator’s voice': ['旁白的声音', '旁白的聲音', 'ナレーターの声', '내레이터 목소리'],
  'Choose a voice': ['选择一个声音', '選擇一個聲音', '声を選ぶ', '목소리 고르기'],
  'Voice id, or empty for the narrator’s': [
    '声音 ID，留空则用旁白的声音',
    '聲音 ID，留空則用旁白的聲音',
    '声の ID（空ならナレーターの声）',
    '목소리 ID (비우면 내레이터 목소리)',
  ],
  'Voice id': ['声音 ID', '聲音 ID', '声の ID', '목소리 ID'],
  '{voice} (not on this computer)': [
    '{voice}（这台电脑上没有）',
    '{voice}（這台電腦上沒有）',
    '{voice}（このコンピューターにはありません）',
    '{voice} (이 컴퓨터에 없음)',
  ],
  'My voices': ['我的声音', '我的聲音', 'わたしの声', '내 목소리'],
  'Give the voice pack a name.': [
    '请给语音包起个名字。',
    '請給語音包取個名字。',
    'ボイスパックに名前を付けてください。',
    '보이스 팩 이름을 정하세요.',
  ],
  'Choose the voice connection to use.': [
    '请选择要用的语音连接。',
    '請選擇要用的語音連線。',
    '使う音声の接続を選んでください。',
    '쓸 음성 연결을 고르세요.',
  ],
  'Choose the narrator’s voice.': [
    '请选择旁白的声音。',
    '請選擇旁白的聲音。',
    'ナレーターの声を選んでください。',
    '내레이터 목소리를 고르세요.',
  ],
  'Reads one line with this voice. The voice service may charge a little.': [
    '用这个声音读一句。语音服务可能会收一点费用。',
    '用這個聲音讀一句。語音服務可能會收一點費用。',
    'この声で 1 行読みます。音声サービスが少し課金することがあります。',
    '이 목소리로 한 줄을 읽습니다. 음성 서비스가 요금을 조금 받을 수 있습니다.',
  ],
  'Reads one line with this voice.': [
    '用这个声音读一句。',
    '用這個聲音讀一句。',
    'この声で 1 行読みます。',
    '이 목소리로 한 줄을 읽습니다.',
  ],
  'Voices from': ['声音来源', '聲音來源', '声の出どころ', '목소리 출처'],
  'This computer (free, offline)': [
    '这台电脑（免费，离线）',
    '這台電腦（免費，離線）',
    'このコンピューター（無料、オフライン）',
    '이 컴퓨터 (무료, 오프라인)',
  ],
  'Choose a voice connection': [
    '选择一个语音连接',
    '選擇一個語音連線',
    '音声の接続を選ぶ',
    '음성 연결 고르기',
  ],
  'AI voices: {name}': ['AI 语音：{name}', 'AI 語音：{name}', 'AI 音声：{name}', 'AI 음성: {name}'],
  'The text being read is sent to this voice service, a paragraph or a line at a time. Each reading is recorded in Usage; ElevenLabs charges by the character, and a voice server on your own computer is free.':
    [
      '正在朗读的文字会一段一段（或一句一句）发送给这个语音服务。每次朗读都会记录在“用量”中；ElevenLabs 按字数收费，你自己电脑上的语音服务器则免费。',
      '正在朗讀的文字會一段一段（或一句一句）傳送給這個語音服務。每次朗讀都會記錄在「用量」中；ElevenLabs 按字數收費，你自己電腦上的語音伺服器則免費。',
      '読み上げる文章は、1 段落か 1 行ずつこの音声サービスに送られます。読み上げはすべて「使用量」に記録されます。ElevenLabs は文字数で課金され、自分のコンピューターの音声サーバーは無料です。',
      '읽는 글은 한 단락이나 한 줄씩 이 음성 서비스로 보냅니다. 읽을 때마다 사용량에 기록됩니다. ElevenLabs는 글자 수로 요금을 매기고, 내 컴퓨터의 음성 서버는 무료입니다.',
    ],
  'For AI voices (your own, cloned or from a voice library), add a voice connection under AI connections: choose ElevenLabs, or a voice server on your computer such as Kokoro.':
    [
      '想用 AI 语音（你自己的、克隆的或声音库里的），请在“AI 连接”中添加语音连接：选择 ElevenLabs，或你电脑上的语音服务器，例如 Kokoro。',
      '想用 AI 語音（你自己的、複製的或聲音庫裡的），請在「AI 連線」中新增語音連線：選擇 ElevenLabs，或你電腦上的語音伺服器，例如 Kokoro。',
      'AI 音声（自分の声、クローンした声、ボイスライブラリの声）を使うには、「AI 接続」で音声の接続を追加します。ElevenLabs か、Kokoro などこのコンピューターの音声サーバーを選んでください。',
      'AI 음성(내 목소리, 복제한 목소리, 보이스 라이브러리 목소리)을 쓰려면 AI 연결에서 음성 연결을 추가하세요. ElevenLabs나 Kokoro 같은 내 컴퓨터의 음성 서버를 고르면 됩니다.',
    ],
  'The computer’s voices cost nothing and never leave this computer.': [
    '电脑自带的语音不花钱，也不会离开这台电脑。',
    '電腦內建的語音不花錢，也不會離開這台電腦。',
    'コンピューターの声は無料で、このコンピューターの外に出ません。',
    '컴퓨터 목소리는 무료이고 이 컴퓨터 밖으로 나가지 않습니다.',
  ],
  Narrator: ['旁白', '旁白', 'ナレーター', '내레이터'],
  'Lines a character speaks (in quotes next to their name, or after "Name:") are read in their voice. Everyone else, and the narration, is read by the narrator.':
    [
      '角色说的话（名字旁的引号里，或“名字:”之后）会用他们的声音朗读。其他人和叙述部分都由旁白朗读。',
      '角色說的話（名字旁的引號裡，或「名字:」之後）會用他們的聲音朗讀。其他人和敘述部分都由旁白朗讀。',
      'キャラクターのせりふ（名前の近くのかぎかっこ内や「名前:」のあと）は、そのキャラクターの声で読みます。ほかの人と地の文はナレーターが読みます。',
      '캐릭터가 하는 말(이름 옆 따옴표 안, 또는 "이름:" 뒤)은 그 캐릭터의 목소리로 읽습니다. 다른 사람과 서술은 내레이터가 읽습니다.',
    ],
  'Character {n} name': [
    '角色 {n} 的名字',
    '角色 {n} 的名字',
    'キャラクター {n} の名前',
    '캐릭터 {n} 이름',
  ],
  'Name, as the story spells it': [
    '名字，按故事里的写法',
    '名字，按故事裡的寫法',
    '物語のとおりの名前',
    '이야기에 쓰인 그대로의 이름',
  ],
  'Voice for {name}': ['{name} 的声音', '{name} 的聲音', '{name} の声', '{name}의 목소리'],
  'this character': ['这个角色', '這個角色', 'このキャラクター', '이 캐릭터'],
  'Add the people from a story': [
    '添加某个故事里的人物',
    '加入某個故事裡的人物',
    '物語の登場人物を追加',
    '이야기 속 인물 추가',
  ],
  'Add the people from a story…': [
    '添加某个故事里的人物…',
    '加入某個故事裡的人物…',
    '物語の登場人物を追加…',
    '이야기 속 인물 추가…',
  ],
  '{title} ({count})': [
    '{title}（{count}）',
    '{title}（{count}）',
    '{title}（{count}）',
    '{title} ({count})',
  ],
  'Voice server (OpenAI-style)': [
    '语音服务器（OpenAI 风格）',
    '語音伺服器（OpenAI 風格）',
    '音声サーバー（OpenAI 形式）',
    '음성 서버 (OpenAI 방식)',
  ],
  'Voices (reading aloud)': [
    '语音（朗读）',
    '語音（朗讀）',
    '音声（読み上げ）',
    '음성 (소리 내어 읽기)',
  ],
  'AI voices for voice packs, including voices you design or clone there. ElevenLabs charges by the character read; the app records every reading but can’t price it.':
    [
      '给语音包用的 AI 语音，包括你在那里设计或克隆的声音。ElevenLabs 按朗读的字数收费；本应用会记录每次朗读，但无法计价。',
      '給語音包用的 AI 語音，包括你在那裡設計或複製的聲音。ElevenLabs 按朗讀的字數收費；本應用程式會記錄每次朗讀，但無法計價。',
      'ボイスパック用の AI 音声。そこで作った声やクローンした声も使えます。ElevenLabs は読み上げた文字数で課金されます。アプリは読み上げをすべて記録しますが、料金は見積もれません。',
      '보이스 팩에 쓰는 AI 음성입니다. 그곳에서 만들거나 복제한 목소리도 됩니다. ElevenLabs는 읽은 글자 수로 요금을 매기며, 앱은 읽을 때마다 기록하지만 가격은 알 수 없습니다.',
    ],
  'Kokoro voice server': [
    'Kokoro 语音服务器',
    'Kokoro 語音伺服器',
    'Kokoro 音声サーバー',
    'Kokoro 음성 서버',
  ],
  'AI voices on this computer, for free: run Kokoro-FastAPI (or any OpenAI-style speech server) and choose its voices in a voice pack.':
    [
      '在这台电脑上免费使用 AI 语音：运行 Kokoro-FastAPI（或任何 OpenAI 风格的语音服务器），然后在语音包里选择它的声音。',
      '在這台電腦上免費使用 AI 語音：執行 Kokoro-FastAPI（或任何 OpenAI 風格的語音伺服器），然後在語音包裡選擇它的聲音。',
      'このコンピューターで無料の AI 音声：Kokoro-FastAPI（または OpenAI 形式の音声サーバー）を動かし、ボイスパックでその声を選びます。',
      '이 컴퓨터에서 무료로 쓰는 AI 음성: Kokoro-FastAPI(또는 OpenAI 방식의 음성 서버)를 실행하고 보이스 팩에서 그 목소리를 고르세요.',
    ],
};
