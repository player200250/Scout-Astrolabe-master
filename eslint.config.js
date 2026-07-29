import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  // 建置產物與覆蓋率報告不是我們寫的程式碼。coverage/ 裡是 istanbul 附的第三方 JS，
  // 沒忽略的話本機跑 `npx eslint .` 會去 lint 它們（CI 碰巧沒踩到，是因為 lint 跑在測試之前）。
  globalIgnores(['dist', 'dist-mobile', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 底線開頭 ＝「我知道沒用到，是故意的」。這是 JS/TS 通用的意圖記號，
      // 專案的測試替身大量使用（vi.fn(async (_id: string) => …)：只在乎有沒有被呼叫、
      // 不在乎參數）。預設設定不認得它，於是把刻意的標記報成錯誤。
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // 這條規則真正要抓的是**藏在程式碼裡**的全形空白——看不見卻會讓語法爆掉。
      // 但畫面文字裡的全形空白是中文排版（例如「卡片數 3　·　更新於 …」的分隔），
      // 是使用者看得到的內容，不是雜訊。程式碼照抓，JSX 文字放行。
      'no-irregular-whitespace': ['error', { skipJSXText: true }],

      // 規則的用意是保住 Vite 的熱更新：一個檔案若同時匯出元件與其他東西，
      // 改動時會退化成整頁重載。專案的做法是把純函式搬去 utils/（見 utils/searchIndex.ts、
      // utils/calendarEvents.ts），所以這條維持開啟。
      // 例外只有 useIsDark：它必須跟 ThemeContext 待在同一個檔才拿得到 context，搬不走。
      'react-refresh/only-export-components': ['error', {
        allowExportNames: ['useIsDark'],
      }],
    },
  },
])
