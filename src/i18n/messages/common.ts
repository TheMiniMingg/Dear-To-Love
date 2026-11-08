// Shared texts: errors, file dialogs, backups, exports, the footer.
// Each entry: [Simplified Chinese, Traditional Chinese, Japanese, Korean].
import type { Messages } from './types';

export const common: Messages = {
  ', ': ['、', '、', '、', ', '],
  Close: ['关闭', '關閉', '閉じる', '닫기'],
  'Left and right arrows change this': [
    '左右方向键可切换',
    '左右方向鍵可切換',
    '左右の矢印キーで切り替えます',
    '왼쪽·오른쪽 화살표 키로 바꿉니다',
  ],

  // Footer
  'version unknown': ['版本未知', '版本不明', 'バージョン不明', '버전 알 수 없음'],
  Diagnostics: ['诊断', '診斷', '診断', '진단'],
  'Opens in your browser': [
    '在浏览器中打开',
    '在瀏覽器中開啟',
    'ブラウザーで開きます',
    '브라우저에서 엽니다',
  ],
  'Support development': ['支持开发', '支持開發', '開発を支援', '개발 후원'],
  'Update available': ['有可用更新', '有可用更新', 'アップデートがあります', '업데이트 있음'],
  'Dear to Love {version} is available.': [
    'Dear to Love {version} 已发布。',
    'Dear to Love {version} 已發布。',
    'Dear to Love {version} が公開されました。',
    'Dear to Love {version}이(가) 나왔습니다.',
  ],
  'Opens the release page on GitHub in your browser': [
    '在浏览器中打开 GitHub 上的发布页面',
    '在瀏覽器中開啟 GitHub 上的發布頁面',
    'GitHub のリリースページをブラウザーで開きます',
    'GitHub 릴리스 페이지를 브라우저에서 엽니다',
  ],
  'View release': ['查看发布', '查看發布', 'リリースを見る', '릴리스 보기'],
  'Hide the notice for v{version}': [
    '隐藏 v{version} 的提示',
    '隱藏 v{version} 的提示',
    'v{version} の通知を隠す',
    'v{version} 알림 숨기기',
  ],
  'Got it': ['知道了', '知道了', 'OK', '확인'],

  // Errors
  'This route changed in the meantime. It has been reloaded.': [
    '这条路线在此期间有变动，已重新载入。',
    '這條路線在此期間有變動，已重新載入。',
    'このルートはその間に変更されたため、読み込み直しました。',
    '그사이에 이 루트가 바뀌어 다시 불러왔습니다.',
  ],
  'The reply was interrupted (the app closed or the connection dropped). If it had reached the AI service, it may still have cost a little.':
    [
      '回复被中断了（应用已关闭或连接断开）。如果请求已到达 AI 服务，可能仍产生了少量费用。',
      '回覆被中斷了（應用程式已關閉或連線中斷）。如果請求已送達 AI 服務，可能仍產生了少量費用。',
      '返信が中断されました（アプリが閉じたか、接続が切れました）。AI サービスに届いていた場合は、少し料金がかかっているかもしれません。',
      '답장이 중단되었습니다(앱이 닫혔거나 연결이 끊겼습니다). 요청이 AI 서비스에 도달했다면 약간의 비용이 들었을 수 있습니다.',
    ],
  'A reply is already being written on this route.': [
    '这条路线上已有回复正在撰写。',
    '這條路線上已有回覆正在撰寫。',
    'このルートではすでに返信を書いています。',
    '이 루트에서 이미 답장을 쓰고 있습니다.',
  ],
  'You stopped the reply.': [
    '你停止了回复。',
    '你停止了回覆。',
    '返信を止めました。',
    '답장을 멈췄습니다.',
  ],
  'The AI connection for this reply was removed. Choose a storyteller and retry.': [
    '这条回复使用的 AI 连接已被删除。请选择讲述者后重试。',
    '這則回覆使用的 AI 連線已被刪除。請選擇講述者後重試。',
    'この返信の AI 接続は削除されました。語り手を選んでから再試行してください。',
    '이 답장에 쓰던 AI 연결이 삭제되었습니다. 이야기꾼을 고른 뒤 다시 시도하세요.',
  ],
  "The AI service's content filter stopped this reply. Try another reply, change the action, or use a model whose rules allow this story, such as a local model.":
    [
      'AI 服务的内容过滤器拦截了这条回复。可以换一条回复、修改行动，或改用规则允许这个故事的模型，例如本地模型。',
      'AI 服務的內容過濾器攔截了這則回覆。可以換一則回覆、修改行動，或改用規則允許這個故事的模型，例如本機模型。',
      'AI サービスのコンテンツフィルターがこの返信を止めました。別の返信を試すか、行動を変えるか、ローカルモデルなど、この物語を許可するモデルを使ってください。',
      'AI 서비스의 콘텐츠 필터가 이 답장을 막았습니다. 다른 답장을 받거나, 행동을 바꾸거나, 로컬 모델처럼 이 이야기를 허용하는 모델을 쓰세요.',
    ],
  'The disk is full, so this could not be saved. Everything saved before is safe. Free up some space, then try again.':
    [
      '磁盘已满，无法保存。之前保存的内容都安全。请腾出一些空间后重试。',
      '磁碟已滿，無法儲存。之前儲存的內容都安全。請騰出一些空間後重試。',
      'ディスクがいっぱいのため保存できませんでした。これまでに保存した内容は無事です。空き容量を増やしてから、もう一度お試しください。',
      '디스크가 가득 차서 저장하지 못했습니다. 이전에 저장한 내용은 안전합니다. 공간을 확보한 뒤 다시 시도하세요.',
    ],
  'The AI service refused the API key.': [
    'AI 服务拒绝了这个 API 密钥。',
    'AI 服務拒絕了這個 API 金鑰。',
    'AI サービスが API キーを拒否しました。',
    'AI 서비스가 API 키를 거부했습니다.',
  ],
  'The AI service is limiting requests or the account is out of credit.': [
    'AI 服务正在限制请求，或账户余额不足。',
    'AI 服務正在限制請求，或帳戶餘額不足。',
    'AI サービスがリクエストを制限しているか、アカウントの残高が足りません。',
    'AI 서비스가 요청을 제한하고 있거나 계정 잔액이 부족합니다.',
  ],
  'The AI service could not be reached.': [
    '无法连接到 AI 服务。',
    '無法連線到 AI 服務。',
    'AI サービスに接続できませんでした。',
    'AI 서비스에 연결할 수 없습니다.',
  ],
  "The story setup and your action don't fit this connection's context limit. Shorten the action, trim long story details (facts, character descriptions), or raise the context limit in Settings.":
    [
      '故事设定加上你的行动超出了这个连接的上下文上限。请缩短行动、精简较长的故事详情（事实、角色描述），或在设置中提高上下文上限。',
      '故事設定加上你的行動超出了這個連線的上下文上限。請縮短行動、精簡較長的故事詳情（事實、角色描述），或在設定中提高上下文上限。',
      '物語の設定とあなたの行動が、この接続のコンテキスト上限に収まりません。行動を短くするか、長い物語の詳細（事実やキャラクターの説明）を削るか、設定でコンテキスト上限を上げてください。',
      '이야기 설정과 행동이 이 연결의 컨텍스트 한도를 넘습니다. 행동을 줄이거나, 긴 이야기 정보(사실, 캐릭터 설명)를 다듬거나, 설정에서 컨텍스트 한도를 올리세요.',
    ],
  'The AI service returned an error.': [
    'AI 服务返回了错误。',
    'AI 服務傳回了錯誤。',
    'AI サービスがエラーを返しました。',
    'AI 서비스가 오류를 반환했습니다.',
  ],
  'Paid replies are paused: this would pass your monthly budget. Raise the budget or switch to Warn only in Usage & budget, or use a local or offline storyteller.':
    [
      '付费回复已暂停：这会超出你的月度预算。请在“用量与预算”中提高预算或改为“仅提醒”，或使用本地或离线讲述者。',
      '付費回覆已暫停：這會超出你的每月預算。請在「用量與預算」中提高預算或改為「僅提醒」，或使用本機或離線講述者。',
      '有料の返信は一時停止中です：月の予算を超えてしまいます。「使用量と予算」で予算を上げるか「警告のみ」に切り替えるか、ローカルまたはオフラインの語り手を使ってください。',
      '유료 답장이 일시 중지되었습니다: 월 예산을 넘게 됩니다. "사용량 및 예산"에서 예산을 올리거나 "경고만"으로 바꾸거나, 로컬 또는 오프라인 이야기꾼을 쓰세요.',
    ],
  "Your budget pauses paid replies, and this model has no prices, so the app can't tell whether this reply fits. Add prices in Usage & budget, or send this one anyway.":
    [
      '你的预算会暂停付费回复，而这个模型没有价格，应用无法判断这条回复是否在预算内。请在“用量与预算”中添加价格，或仍然发送这一条。',
      '你的預算會暫停付費回覆，而這個模型沒有價格，應用程式無法判斷這則回覆是否在預算內。請在「用量與預算」中加入價格，或仍然送出這一則。',
      '予算の設定で有料の返信は止まりますが、このモデルには料金が設定されていないため、この返信が予算内か判断できません。「使用量と予算」で料金を追加するか、今回はそのまま送信してください。',
      '예산 설정으로 유료 답장이 멈추는데, 이 모델에는 가격이 없어 이 답장이 예산 안인지 알 수 없습니다. "사용량 및 예산"에서 가격을 추가하거나, 이번에는 그대로 보내세요.',
    ],
  'The reply did not finish.': [
    '回复没有完成。',
    '回覆沒有完成。',
    '返信が完了しませんでした。',
    '답장이 끝나지 않았습니다.',
  ],

  // Backups and file dialogs
  'Dear to Love backup': [
    'Dear to Love 备份',
    'Dear to Love 備份',
    'Dear to Love バックアップ',
    'Dear to Love 백업',
  ],
  Automatic: ['自动', '自動', '自動', '자동'],
  'Before an app upgrade': ['应用升级前', '應用程式升級前', 'アプリの更新前', '앱 업그레이드 전'],
  'Before a restore': ['恢复前', '還原前', '復元前', '복원 전'],
  'Back up everything': ['备份全部内容', '備份全部內容', 'すべてをバックアップ', '모두 백업'],
  'Restore from a backup file': [
    '从备份文件恢复',
    '從備份檔案還原',
    'バックアップファイルから復元',
    '백업 파일에서 복원',
  ],
  'Saved {file} ({size}): {stories}, {images}.': [
    '已保存 {file}（{size}）：{stories}，{images}。',
    '已儲存 {file}（{size}）：{stories}，{images}。',
    '{file}（{size}）を保存しました：{stories}、{images}。',
    '{file}({size})을(를) 저장했습니다: {stories}, {images}.',
  ],
  '{n} stories': ['{n} 个故事', '{n} 個故事', 'ストーリー {n} 件', '스토리 {n}개'],
  '{n} images': ['{n} 张图片', '{n} 張圖片', '画像 {n} 枚', '이미지 {n}개'],
  '{n} image files were missing and left out.': [
    '{n} 个图片文件缺失，已略过。',
    '{n} 個圖片檔案遺失，已略過。',
    '画像ファイル {n} 件が見つからず、含めませんでした。',
    '이미지 파일 {n}개가 없어 빼고 저장했습니다.',
  ],
  '{stories} with {routes}, and {images}.': [
    '{stories}（共 {routes}），以及 {images}。',
    '{stories}（共 {routes}），以及 {images}。',
    '{stories}（{routes}）と{images}。',
    '{stories}({routes}), {images}.',
  ],
  '{n} routes': ['{n} 条路线', '{n} 條路線', 'ルート {n} 本', '루트 {n}개'],
  'unknown problem': ['未知问题', '未知問題', '不明な問題', '알 수 없는 문제'],
  'Restored the backup from {when}. Your earlier data is kept under Settings → Backups as "Before a restore".':
    [
      '已恢复 {when} 的备份。你之前的数据保存在“设置 → 备份”中，名为“恢复前”。',
      '已還原 {when} 的備份。你之前的資料保存在「設定 → 備份」中，名為「還原前」。',
      '{when} のバックアップを復元しました。以前のデータは「設定 → バックアップ」に「復元前」として残っています。',
      '{when} 백업을 복원했습니다. 이전 데이터는 "설정 → 백업"에 "복원 전"으로 남아 있습니다.',
    ],
  'Restored the backup. Your earlier data is kept under Settings → Backups as "Before a restore".':
    [
      '已恢复备份。你之前的数据保存在“设置 → 备份”中，名为“恢复前”。',
      '已還原備份。你之前的資料保存在「設定 → 備份」中，名為「還原前」。',
      'バックアップを復元しました。以前のデータは「設定 → バックアップ」に「復元前」として残っています。',
      '백업을 복원했습니다. 이전 데이터는 "설정 → 백업"에 "복원 전"으로 남아 있습니다.',
    ],
  'The backup from {when} could not be restored: {problem}.': [
    '无法恢复 {when} 的备份：{problem}。',
    '無法還原 {when} 的備份：{problem}。',
    '{when} のバックアップを復元できませんでした：{problem}。',
    '{when} 백업을 복원하지 못했습니다: {problem}.',
  ],
  'The backup could not be restored: {problem}.': [
    '无法恢复备份：{problem}。',
    '無法還原備份：{problem}。',
    'バックアップを復元できませんでした：{problem}。',
    '백업을 복원하지 못했습니다: {problem}.',
  ],

  // Storypacks and text exports
  'Dear to Love storypack': [
    'Dear to Love 故事包',
    'Dear to Love 故事包',
    'Dear to Love ストーリーパック',
    'Dear to Love 스토리팩',
  ],
  'Save storypack': ['保存故事包', '儲存故事包', 'ストーリーパックを保存', '스토리팩 저장'],
  'Import storypack': [
    '导入故事包',
    '匯入故事包',
    'ストーリーパックを読み込む',
    '스토리팩 가져오기',
  ],
  'Markdown (.md)': ['Markdown（.md）', 'Markdown（.md）', 'Markdown（.md）', 'Markdown(.md)'],
  'Plain text (.txt)': [
    '纯文本（.txt）',
    '純文字（.txt）',
    'テキスト（.txt）',
    '일반 텍스트(.txt)',
  ],
  'Save as text': ['另存为文本', '另存為文字', 'テキストとして保存', '텍스트로 저장'],
  'Saved {file} ({size}): {what}.': [
    '已保存 {file}（{size}）：{what}。',
    '已儲存 {file}（{size}）：{what}。',
    '{file}（{size}）を保存しました：{what}。',
    '{file}({size})을(를) 저장했습니다: {what}.',
  ],
  '{n} pictures': ['{n} 张图片', '{n} 張圖片', '画像 {n} 枚', '이미지 {n}개'],
  '{n} pictures were missing from the image library and left out.': [
    '图片库中缺少 {n} 张图片，已略过。',
    '圖片庫中缺少 {n} 張圖片，已略過。',
    '画像ライブラリに画像 {n} 枚が見つからず、含めませんでした。',
    '이미지 보관함에 이미지 {n}개가 없어 빼고 저장했습니다.',
  ],
  'Imported "{title}" with {routes}.': [
    '已导入“{title}”，共 {routes}。',
    '已匯入「{title}」，共 {routes}。',
    '「{title}」を読み込みました（{routes}）。',
    '"{title}"을(를) 가져왔습니다({routes}).',
  ],
  '{n} new images added.': [
    '新增了 {n} 张图片。',
    '新增了 {n} 張圖片。',
    '新しい画像を {n} 枚追加しました。',
    '새 이미지 {n}개를 추가했습니다.',
  ],
  '{n} images were already in your library.': [
    '{n} 张图片已在你的图片库中。',
    '{n} 張圖片已在你的圖片庫中。',
    '画像 {n} 枚はすでにライブラリにありました。',
    '이미지 {n}개는 이미 보관함에 있었습니다.',
  ],
  'Saved {file}: {chapters}, {turns}.': [
    '已保存 {file}：{chapters}，{turns}。',
    '已儲存 {file}：{chapters}，{turns}。',
    '{file} を保存しました：{chapters}、{turns}。',
    '{file}을(를) 저장했습니다: {chapters}, {turns}.',
  ],
  '{n} chapters': ['{n} 章', '{n} 章', '{n} 章', '{n}장'],
  '{n} turns': ['{n} 回合', '{n} 回合', '{n} ターン', '{n}턴'],

  // Image imports
  'Add images': ['添加图片', '加入圖片', '画像を追加', '이미지 추가'],
  'Images (PNG, JPEG, WebP, GIF)': [
    '图片（PNG、JPEG、WebP、GIF）',
    '圖片（PNG、JPEG、WebP、GIF）',
    '画像（PNG、JPEG、WebP、GIF）',
    '이미지(PNG, JPEG, WebP, GIF)',
  ],
  '{file}: {problem}': [
    '{file}：{problem}',
    '{file}：{problem}',
    '{file}：{problem}',
    '{file}: {problem}',
  ],
  'A file': ['一个文件', '一個檔案', 'ファイル', '파일'],
  'No images were added.': [
    '没有添加图片。',
    '沒有加入圖片。',
    '画像は追加されませんでした。',
    '추가된 이미지가 없습니다.',
  ],
  'Added {n} images.': [
    '已添加 {n} 张图片。',
    '已加入 {n} 張圖片。',
    '画像を {n} 枚追加しました。',
    '이미지 {n}개를 추가했습니다.',
  ],
  '{n} were already in your library and are reused.': [
    '其中 {n} 张已在图片库中，将直接使用。',
    '其中 {n} 張已在圖片庫中，將直接使用。',
    '{n} 枚はすでにライブラリにあったので、それを使います。',
    '{n}개는 이미 보관함에 있어 그대로 씁니다.',
  ],
  'just now': ['刚刚', '剛剛', 'たった今', '방금'],
  'Save as a book': ['存为书', '存為書', '本として保存', '책으로 저장'],
  'E-book (.epub)': ['电子书 (.epub)', '電子書 (.epub)', '電子書籍 (.epub)', '전자책 (.epub)'],
  'Saved {file} ({size}): {chapters}, {turns}.': [
    '已保存 {file}（{size}）：{chapters}，{turns}。',
    '已儲存 {file}（{size}）：{chapters}，{turns}。',
    '{file}（{size}）を保存しました：{chapters}、{turns}。',
    '{file}({size})을(를) 저장했습니다: {chapters}, {turns}.',
  ],
  'The story’s cover is on the front.': [
    '故事的封面就在书的正面。',
    '故事的封面就在書的正面。',
    'ストーリーの表紙が表に付いています。',
    '스토리의 표지가 앞에 있습니다.',
  ],
  'The story has no cover picture, so the front shows its title.': [
    '这个故事没有封面图片，所以封面显示的是标题。',
    '這個故事沒有封面圖片，所以封面顯示的是標題。',
    'このストーリーには表紙の絵がないので、表紙にはタイトルが入ります。',
    '이 스토리에는 표지 그림이 없어서 표지에 제목이 들어갑니다.',
  ],
  'Report a problem': ['报告问题', '回報問題', '問題を報告', '문제 신고'],
  'bug feedback': ['错误 反馈', '錯誤 意見回饋', 'バグ フィードバック', '버그 피드백'],
  'Say what happened, and the app adds a short report: versions and check results, with no story text, titles, API keys or file paths. Nothing is sent from here. Copy it into an email or a message to whoever gave you the app, or into a new issue on GitHub.':
    [
      '说说发生了什么，应用会附上一份简短报告：版本和检查结果，不含故事文字、标题、API 密钥或文件路径。这里不会发送任何内容。把它复制到发给提供应用给你的人的邮件或消息里，或者复制到 GitHub 的新议题中。',
      '說說發生了什麼，應用程式會附上一份簡短報告：版本和檢查結果，不含故事文字、標題、API 金鑰或檔案路徑。這裡不會傳送任何內容。把它複製到寄給提供應用程式給你的人的郵件或訊息裡，或者複製到 GitHub 的新議題中。',
      '何が起きたかを書くと、アプリが短いレポートを添えます。内容はバージョンとチェック結果だけで、物語の文章、タイトル、API キー、ファイルのパスは含みません。ここからは何も送信されません。アプリをくれた人へのメールやメッセージ、または GitHub の新しい Issue に貼り付けてください。',
      '무슨 일이 있었는지 쓰면 앱이 짧은 보고서를 덧붙입니다. 버전과 점검 결과만 담기며, 이야기 본문, 제목, API 키, 파일 경로는 들어가지 않습니다. 여기서는 아무것도 보내지 않습니다. 앱을 준 사람에게 보내는 이메일이나 메시지, 또는 GitHub의 새 이슈에 붙여 넣으세요.',
    ],
  'What happened?': ['发生了什么？', '發生了什麼？', '何が起きましたか？', '무슨 일이 있었나요?'],
  'What you did, what you expected, and what happened instead.': [
    '你做了什么，你期望发生什么，实际发生了什么。',
    '你做了什麼，你期望發生什麼，實際發生了什麼。',
    '何をしたか、どうなると思ったか、実際にはどうなったか。',
    '무엇을 했는지, 무엇을 기대했는지, 실제로는 어떻게 됐는지.',
  ],
  'The report it adds': ['附上的报告', '附上的報告', '添えるレポート', '덧붙이는 보고서'],
  'Copy and open GitHub': [
    '复制并打开 GitHub',
    '複製並開啟 GitHub',
    'コピーして GitHub を開く',
    '복사하고 GitHub 열기',
  ],
  Copy: ['复制', '複製', 'コピー', '복사'],
  'Copying did not work here. Save it as a file and attach that instead.': [
    '这里无法复制。请另存为文件，然后附上该文件。',
    '這裡無法複製。請另存為檔案，然後附上該檔案。',
    'ここではコピーできませんでした。ファイルに保存して、それを添付してください。',
    '여기서는 복사할 수 없었습니다. 파일로 저장해서 첨부하세요.',
  ],
  'Copied. Paste it into the issue that opened in your browser.': [
    '已复制。请粘贴到浏览器中打开的议题里。',
    '已複製。請貼到瀏覽器中開啟的議題裡。',
    'コピーしました。ブラウザーで開いた Issue に貼り付けてください。',
    '복사했습니다. 브라우저에서 열린 이슈에 붙여 넣으세요.',
  ],
  'Copied. Paste it into an email or a message.': [
    '已复制。请粘贴到邮件或消息中。',
    '已複製。請貼到郵件或訊息中。',
    'コピーしました。メールやメッセージに貼り付けてください。',
    '복사했습니다. 이메일이나 메시지에 붙여 넣으세요.',
  ],
};
