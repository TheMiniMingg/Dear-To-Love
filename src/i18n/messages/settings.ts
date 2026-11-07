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
  'Built in. Simple replies, works without internet, never costs anything.': [
    '内置。回复简单，无需联网，完全免费。',
    '內建。回覆簡單，無需連網，完全免費。',
    '内蔵です。返信はシンプルで、インターネットなしで動き、費用はかかりません。',
    '내장되어 있습니다. 답장은 간단하고 인터넷 없이 작동하며 비용이 들지 않습니다.',
  ],
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
  'Makes character portraits from their descriptions. It never writes story replies; choose it under Pictures in Settings.':
    [
      '根据角色描述生成肖像。它从不撰写故事回复；请在设置的“图片”中选择它。',
      '根據角色描述產生肖像。它從不撰寫故事回覆；請在設定的「圖片」中選擇它。',
      'キャラクターの説明から肖像画を作ります。ストーリーの返信は書きません。設定の「画像」で選んでください。',
      '캐릭터 설명으로 초상화를 만듭니다. 스토리 답장은 쓰지 않으니 설정의 "이미지"에서 고르세요.',
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
  'Pictures (for character portraits)': [
    '图片（用于角色肖像）',
    '圖片（用於角色肖像）',
    '画像（キャラクターの肖像画用）',
    '이미지(캐릭터 초상화용)',
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
  "Makes character portraits. OpenAI charges for each picture; the app records every request but can't price pictures.":
    [
      '生成角色肖像。OpenAI 按张收费；应用会记录每次请求，但无法为图片计价。',
      '產生角色肖像。OpenAI 按張收費；應用程式會記錄每次請求，但無法為圖片計價。',
      'キャラクターの肖像画を作ります。OpenAI は画像ごとに課金します。アプリはリクエストをすべて記録しますが、画像の料金は計算できません。',
      '캐릭터 초상화를 만듭니다. OpenAI는 이미지마다 요금을 받습니다. 앱은 요청을 모두 기록하지만 이미지 가격은 계산하지 못합니다.',
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
};
