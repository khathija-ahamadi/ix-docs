import { useState, useRef, useEffect } from 'react';
import styles from './styles.module.css';

const CHAT_URL = 'http://localhost:5000/chat';
const GENERATE_URL = 'http://localhost:5000/generate';
const API_KEY_STORAGE = 'ix-assistant-api-key';
const CHAT_HISTORY_STORAGE = 'ix-assistant-chat-history';
const CODEGEN_HISTORY_STORAGE = 'ix-assistant-codegen-history';
const MAX_HISTORY = 10;
const REFINE_URL = 'http://localhost:5000/refine';
const MIGRATE_URL = 'http://localhost:5000/migrate';
const DEPRECATION_CHECK_URL = 'http://localhost:5000/deprecation-check';
const FEEDBACK_URL = 'http://localhost:5000/feedback';
const FEEDBACK_FALLBACK_URLS = Array.from(new Set([
  FEEDBACK_URL,
  FEEDBACK_URL.replace(/\/feedback$/, '/api/feedback'),
  FEEDBACK_URL.replace(/\/feedback$/, '/user-feedback'),
]));
const LANG_STORAGE = 'ix-assistant-lang';
const CHAT_PROVIDER_STORAGE = 'ix-assistant-chat-provider';
const CODEGEN_PROVIDER_STORAGE = 'ix-assistant-codegen-provider';
const GROQ_KEY_STORAGE = 'ix-assistant-groq-key';
const CHAT_MODEL_STORAGE = 'ix-assistant-chat-model';
const CODEGEN_MODEL_STORAGE = 'ix-assistant-codegen-model';
const USER_PROFILE_STORAGE = 'ix-assistant-user-profile';

// ── Multi-language support ──────────────────────────────────────────────────
type Language = 'en' | 'de' | 'zh' | 'fr' | 'es' | 'ja' | 'pt' | 'ko';

// ── AI Provider & Model config ─────────────────────────────────────────────
type Provider = 'siemens' | 'groq';

interface ModelOption {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
}

const SIEMENS_MODELS: ModelOption[] = [
  { id: 'glm-5', label: 'glm-5', description: 'Recommended for Chat — state-of-the-art agentic model', recommended: true },
  { id: 'qwen3-30b-a3b-instruct-2507', label: 'Qwen3-30B', description: 'General purpose, high performance' },
  { id: 'qwen3-30b-a3b-thinking-2507', label: 'Qwen3-30B Thinking', description: 'Advanced reasoning' },
  { id: 'deepseek-r1-0528-qwen3-8b', label: 'DeepSeek R1 Qwen3 8B', description: 'Reasoning-focused stable chat model' },
  { id: 'devstral-small-2505', label: 'Devstral', description: 'Recommended for Code Gen — best for coding & agentic tasks', recommended: true },
  { id: 'mistral-7b-instruct', label: 'Mistral 7B', description: 'Fast & lightweight' },
];

const GROQ_MODELS: ModelOption[] = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', description: 'Recommended for Chat & Code Gen — best quality on Groq', recommended: true },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', description: 'Fastest low-latency alternative' },
];

const PROVIDER_MODELS: Record<Provider, ModelOption[]> = {
  siemens: SIEMENS_MODELS,
  groq: GROQ_MODELS,
};

const CHAT_PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  siemens: 'glm-5',
  groq: 'llama-3.3-70b-versatile',
};

const CODEGEN_PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  siemens: 'devstral-small-2505',
  groq: 'llama-3.3-70b-versatile',
};

const PROVIDER_LABELS: Record<Provider, string> = {
  siemens: 'Siemens',
  groq: 'Groq',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: '🇬🇧 English',
  de: '🇩🇪 Deutsch',
  zh: '🇨🇳 中文',
  fr: '🇫🇷 Français',
  es: '🇪🇸 Español',
  ja: '🇯🇵 日本語',
  pt: '🇵🇹 Português',
  ko: '🇰🇷 한국어',
};

const UI_TEXT: Record<Language, Record<string, string>> = {
  en: {
    analyticsTitle: 'Usage Analytics',
    analyticsDescription: 'Track common questions to improve documentation and product guidance. Data is in-memory and resets on server restart.',
    loading: 'Loading…',
    analyticsLoadError: '⚠️ Could not load analytics: {error}',
    queriesByFeature: 'Queries by Feature',
    topQuestions: 'Top Questions',
    recentQueries: 'Recent Queries',
    noQueriesYet: 'No queries tracked yet. Use Chat or Code Gen to generate data.',
    feature: 'Feature',
    queries: 'Queries',
    chat: 'Chat',
    codeGen: 'Code Gen',
    account: 'Account',
    more: 'More',
    moreOptions: 'More options',
    history: 'History',
    clear: 'Clear',
    freeTier: 'Free tier',
    addApiKey: 'Add API key',
    forAiResponses: 'for AI responses.',
    responseLanguageTitle: '🌍 Response Language',
    responseLanguageDescription: 'The AI will respond in the selected language. Code examples always remain in their original language.',
    settings: 'Settings',
    help: 'Help',
    migrate: 'Migrate',
    openAssistant: 'Open AI Assistant',
    closeAssistant: 'Close AI Assistant',
    assistantTitle: 'iX AI Assistant',
    send: 'Send',
    askPlaceholder: 'Ask about Siemens iX...',
    listening: 'Listening…',
    settingsApiKey: '🔑 API Key',
    providerKeyToManage: 'Provider key to manage',
    providerModelTitle: '🤖 AI Provider & Model',
    providerModelDescription: 'Configure Chat and Code Gen independently. Each can use a different provider and model.',
    freeVsAi: '🆓 Free vs AI Assistant',
    docs: 'Go to docs',
    blog: 'Blog',
    support: 'Support',
    starterApp: 'Starter app',
    migrationTitle: '↔ Deprecation Migration Wizard',
    migrationDescription: 'Paste code that uses deprecated iX APIs. The wizard analyzes it and outputs upgraded code with a line-by-line diff and a plain-language migration summary.',
    migrationModeApi: 'API Migration',
    migrationModeUpgrade: 'Version Upgrade',
    migrationUpgradeDescription: 'Upgrade code between supported iX versions. Select source and target versions to get guidance and transformed code.',
    yourExistingCode: 'Your existing code',
    migrationPlaceholder: 'Paste code that uses deprecated iX components or APIs…',
    migrationUpgradePlaceholder: 'Paste code to upgrade between iX versions…',
    analyzing: 'Analyzing…',
    analyzeAndMigrate: 'Analyze & Migrate',
    analyzeAndUpgrade: 'Analyze & Upgrade',
    summary: 'Summary:',
    diff: '🔄 Diff (old → new)',
    migratedCode: 'Migrated Code',
    fromVersion: 'From Version',
    toVersion: 'To Version',
    version: 'Version',
    versionStatus: 'Status',
    latest: 'Latest',
    maintenance: 'Maintenance',
    endOfLife: 'End of Life',
    released: 'Released',
    maintenanceSince: 'Maintenance since',
    eolSince: 'End of life since',
    notApplicable: '-',
    upgradeVersionRequired: 'Select both source and target versions.',
    upgradeVersionOrderError: 'Target version must be newer than source version.',
    upgradeFromEolWarning: '⚠️ Source version {version} is End of Life. Upgrade is recommended as soon as possible.',
    upgradePathHint: 'Recommended path for V2.0.0: upgrade to V3.0.0 first, then to V4.0.0.',
    showVersionTable: 'Show version table',
    hideVersionTable: 'Hide version table',
    copy: 'Copy',
    voiceInputNotSupported: 'Voice input is not supported in this browser.',
    voiceRecognitionError: 'Voice recognition error. Please try again.',
    deprecationHint: '⚠️ Deprecated API detected: {names}. The bot will suggest the correct replacement.',
    chatCleared: 'Chat cleared. Ask me anything about Siemens iX!',
    codeGenerationNeedsKey: '🔑 Code generation requires an AI model. Add your AI API key in the ⚙️ Settings tab to unlock this feature.',
    deprecationWarningCodegen: '⚠️ Some matched components contain deprecation notices. Review the generated code comments carefully and check the migration guide.',
    noCodeGenerated: 'No code generated.',
    somethingWentWrong: 'Something went wrong',
    couldNotDownloadGenerated: 'Could not download generated content.',
    refinementNeedsKey: '🔑 Code refinement requires an API key — add one in ⚙️ Settings.',
    refinementFailed: 'Refinement failed',
    migrationNeedsKey: '🔑 Migration analysis requires an API key — add one in ⚙️ Settings.',
    migrationFailed: 'Migration analysis failed',
    migrationRequiresApiKey: '🔑 Migration requires an API key. Add one in',
    settingsArrow: '⚙️ Settings →',
    chatHistory: 'Chat History',
    noSavedChatSessions: 'No saved sessions yet. Chat sessions are saved when you clear or start a new conversation.',
    codeGenHistory: 'Code Gen History',
    noSavedCodegenSessions: 'No saved generations yet. Code sessions are saved when you clear or start a new generation.',
    restore: 'Restore',
    delete: 'Delete',
    you: 'You',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ This response mentions deprecated APIs or breaking changes. Check migration docs.',
    sourcesLabel: 'Sources:',
    thinking: 'Thinking…',
    stopListening: 'Stop listening',
    voiceInput: 'Voice input',
    stopVoiceInput: 'Stop voice input',
    startVoiceInput: 'Start voice input',
    readAloud: 'Read aloud',
    stopReading: 'Stop reading',
    ttsNotSupported: 'Text-to-speech is not supported in this browser.',
    describeYourUi: 'Describe your UI',
    describeUiPlaceholder: 'e.g. Create a login page with username, password, and login button',
    pressCtrlEnter: 'Press Ctrl+Enter to generate',
    tryExample: 'Try an example',
    componentPicker: 'Component Picker',
    hide: 'Hide',
    browseAndAdd: 'Browse & add ▾',
    searchComponentsPlaceholder: 'Search components… (e.g. button, modal, input)',
    addComponentToPrompt: 'Add {component} to prompt',
    framework: 'Framework',
    generating: 'Generating…',
    generateCode: 'Generate Code',
    componentsUsed: 'Components used ({count})',
    generatedCode: 'Generated Code',
    openInStackblitz: 'Open in StackBlitz live sandbox',
    regenerateCode: 'Regenerate code',
    regenerate: 'Regenerate',
    downloadCode: 'Download code',
    download: 'Download',
    copyCode: 'Copy code',
    copied: 'Copied!',
    refinePlaceholder: 'Refine: e.g. “make the button secondary” or “add a loading state”…',
    refineTitle: 'Refine the generated code with a natural language instruction',
    refine: 'Refine',
    siemensKeyDescription: 'Available to every Siemens employee — no credit card needed. Generate your key on my.siemens.com → My Keys → Create, scope: llm.',
    siemensKeyLink: '↗ Get your Siemens LLM API key (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'Get your free Groq API key at console.groq.com. Groq provides ultra-fast inference for open-weight models.',
    groqKeyLink: '↗ Get your Groq API key (console.groq.com → API Keys)',
    keyLoadingLabel: 'Loading…',
    keyDecrypting: 'Decrypting…',
    siemensKeySavedEncrypted: '✅ Siemens API key (saved & encrypted)',
    enterSiemensApiKey: 'Enter your Siemens API key',
    removeKey: 'Remove key',
    saveKey: 'Save Key',
    siemensSavedBadge: '✓ Siemens key saved! AI features unlocked.',
    groqKeySavedEncrypted: '✅ Groq API key (saved & encrypted)',
    enterGroqApiKey: 'Enter your Groq API key',
    groqSavedBadge: '✓ Groq key saved! AI features unlocked.',
    provider: 'Provider',
    model: 'Model',
    keySavedSuffix: ' ✓ key saved',
    addKeyFirstSuffix: ' (add key first)',
    free: 'Free',
    withKey: 'With Key',
    ixFaqAnswers: 'iX FAQ answers',
    componentLookup: 'Component lookup',
    chatAnswers: 'Chat answers',
    docsOnly: 'Docs-only',
    aiLlm: 'AI (LLM)',
    codeGeneration: 'Code generation',
    modelSelection: 'Model selection',
    keysEncryptedPrefix: '🔒 Your keys are',
    keysEncryptedCore: 'AES-256-GCM encrypted',
    keysEncryptedSuffix: "before being saved to localStorage — never stored as plain text. Keys are only sent to the chosen provider's API endpoint.",
    changeProviderModel: 'Change provider and model',
    addKeyInSettingsSuffix: ' (add key in Settings)',
    accountTitle: '👤 Your Account',
    accountDescription: 'Manage your iX AI Assistant profile and preferences.',
    userName: 'Display Name',
    userNamePlaceholder: 'Enter your name (e.g., John Doe)',
    userEmail: 'Email Address',
    userEmailPlaceholder: 'your.email@siemens.com',
    userTheme: 'Theme Preference',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    autoTheme: 'Auto (System)',
    notificationsEnabled: 'Enable Notifications',
    notificationsDescription: 'Get notified when chat responses are ready',
    saveProfile: 'Save Profile',
    profileSaved: '✓ Profile saved successfully!',
    profileSaveError: 'Failed to save profile. Please try again.',
    accountStats: 'Your Statistics',
    chatSessions: 'Chat Sessions',
    codeGenSessions: 'Code Generations',
    questionsAsked: 'Questions Asked',
    codeGenerated: 'Code Generated',
    feedbackTitle: 'Was this helpful?',
    thumbsUp: '👍',
    thumbsDown: '👎',
    feedbackCorrectionPlaceholder: 'Tell us what should be improved (optional)',
    submitFeedback: 'Submit feedback',
    feedbackThanks: 'Thanks for your feedback!',
    feedbackSubmitFailed: 'Could not submit feedback',
    sendingFeedback: 'Sending…',
  },
  de: {
    analyticsTitle: 'Nutzungsanalyse',
    analyticsDescription: 'Verfolge häufige Fragen, um Dokumentation und Produkt-Hinweise zu verbessern. Die Daten sind im Speicher und werden beim Server-Neustart zurückgesetzt.',
    loading: 'Wird geladen…',
    analyticsLoadError: '⚠️ Analyse konnte nicht geladen werden: {error}',
    queriesByFeature: 'Anfragen nach Funktion',
    topQuestions: 'Top-Fragen',
    recentQueries: 'Letzte Anfragen',
    noQueriesYet: 'Noch keine Anfragen erfasst. Nutze Chat oder Code Gen, um Daten zu erzeugen.',
    feature: 'Funktion',
    queries: 'Anfragen',
    chat: 'Chat',
    codeGen: 'Code-Gen',
    account: 'Konto',
    more: 'Mehr',
    moreOptions: 'Weitere Optionen',
    history: 'Verlauf',
    clear: 'Leeren',
    freeTier: 'Kostenlose Stufe',
    addApiKey: 'API-Schlüssel hinzufügen',
    forAiResponses: 'für KI-Antworten.',
    responseLanguageTitle: '🌍 Antwortsprache',
    responseLanguageDescription: 'Die KI antwortet in der ausgewählten Sprache. Codebeispiele bleiben in ihrer Originalsprache.',
    settings: 'Einstellungen',
    help: 'Hilfe',
    migrate: 'Migrieren',
    openAssistant: 'AI Assistant öffnen',
    closeAssistant: 'AI Assistant schließen',
    assistantTitle: 'iX AI Assistant',
    send: 'Senden',
    askPlaceholder: 'Frage zu Siemens iX stellen...',
    listening: 'Hört zu…',
    settingsApiKey: '🔑 API-Schlüssel',
    providerKeyToManage: 'Zu verwaltender Provider-Schlüssel',
    providerModelTitle: '🤖 KI-Provider & Modell',
    providerModelDescription: 'Konfiguriere Chat und Code Gen unabhängig voneinander. Jeder kann einen anderen Provider und ein anderes Modell nutzen.',
    freeVsAi: '🆓 Kostenlos vs. KI-Assistent',
    docs: 'Zur Doku',
    blog: 'Blog',
    support: 'Support',
    starterApp: 'Starter-App',
    migrationTitle: '↔ Deprecation-Migrationsassistent',
    migrationDescription: 'Füge Code ein, der veraltete iX-APIs verwendet. Der Assistent analysiert ihn und erzeugt aktualisierten Code mit Zeilen-Diff und verständlicher Zusammenfassung.',
    migrationModeApi: 'API-Migration',
    migrationModeUpgrade: 'Versions-Upgrade',
    migrationUpgradeDescription: 'Aktualisiere Code zwischen unterstützten iX-Versionen. Wähle Quell- und Zielversionen für Hinweise und transformierten Code.',
    yourExistingCode: 'Dein bestehender Code',
    migrationPlaceholder: 'Code mit veralteten iX-Komponenten oder APIs einfügen…',
    migrationUpgradePlaceholder: 'Code zum Upgrade zwischen iX-Versionen einfügen…',
    analyzing: 'Analysiere…',
    analyzeAndMigrate: 'Analysieren & Migrieren',
    analyzeAndUpgrade: 'Analysieren & Upgraden',
    summary: 'Zusammenfassung:',
    diff: '🔄 Diff (alt → neu)',
    migratedCode: 'Migrierter Code',
    fromVersion: 'Von Version',
    toVersion: 'Zu Version',
    version: 'Version',
    versionStatus: 'Status',
    latest: 'Aktuell',
    maintenance: 'Wartung',
    endOfLife: 'End of Life',
    released: 'Veröffentlicht',
    maintenanceSince: 'Wartung seit',
    eolSince: 'End of Life seit',
    notApplicable: '-',
    upgradeVersionRequired: 'Bitte Quell- und Zielversion auswählen.',
    upgradeVersionOrderError: 'Zielversion muss neuer sein als Quellversion.',
    upgradeFromEolWarning: '⚠️ Quellversion {version} ist End of Life. Ein Upgrade wird dringend empfohlen.',
    upgradePathHint: 'Empfohlener Pfad für V2.0.0: erst auf V3.0.0 upgraden, dann auf V4.0.0.',
    showVersionTable: 'Versionstabelle anzeigen',
    hideVersionTable: 'Versionstabelle ausblenden',
    copy: 'Kopieren',
    voiceInputNotSupported: 'Spracheingabe wird in diesem Browser nicht unterstützt.',
    voiceRecognitionError: 'Spracherkennungsfehler. Bitte versuche es erneut.',
    deprecationHint: '⚠️ Veraltete API erkannt: {names}. Der Bot wird die korrekte Ersetzung vorschlagen.',
    chatCleared: 'Chat geleert. Frag mich alles über Siemens iX!',
    codeGenerationNeedsKey: '🔑 Code-Generierung erfordert ein KI-Modell. Füge deinen AI API-Schlüssel im ⚙️ Einstellungen-Tab hinzu, um diese Funktion freizuschalten.',
    deprecationWarningCodegen: '⚠️ Einige übereinstimmende Komponenten enthalten Deprecation-Hinweise. Überprüfe die generierten Code-Kommentare sorgfältig und siehe den Migrations-Leitfaden.',
    noCodeGenerated: 'Kein Code generiert.',
    somethingWentWrong: 'Etwas ist schiefgelaufen',
    couldNotDownloadGenerated: 'Generierter Inhalt konnte nicht heruntergeladen werden.',
    refinementNeedsKey: '🔑 Code-Verfeinerung erfordert einen API-Schlüssel — füge einen in ⚙️ Einstellungen hinzu.',
    refinementFailed: 'Verfeinerung fehlgeschlagen',
    migrationNeedsKey: '🔑 Migrationsanalyse erfordert einen API-Schlüssel — füge einen in ⚙️ Einstellungen hinzu.',
    migrationFailed: 'Migrationsanalyse fehlgeschlagen',
    migrationRequiresApiKey: '🔑 Migration erfordert einen API-Schlüssel. Füge einen hinzu in',
    settingsArrow: '⚙️ Einstellungen →',
    chatHistory: 'Chat-Verlauf',
    noSavedChatSessions: 'Noch keine gespeicherten Sitzungen. Chat-Sitzungen werden gespeichert, wenn du löschst oder eine neue Konversation startest.',
    codeGenHistory: 'Code-Gen-Verlauf',
    noSavedCodegenSessions: 'Noch keine gespeicherten Generierungen. Code-Sitzungen werden gespeichert, wenn du löschst oder eine neue Generierung startest.',
    restore: 'Wiederherstellen',
    delete: 'Löschen',
    you: 'Du',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ Diese Antwort erwähnt veraltete APIs oder Breaking Changes. Schaue in die Migrationsdokumente.',
    sourcesLabel: 'Quellen:',
    thinking: 'Denkt nach…',
    stopListening: 'Zuhören stoppen',
    voiceInput: 'Spracheingabe',
    stopVoiceInput: 'Spracheingabe stoppen',
    startVoiceInput: 'Spracheingabe starten',
    readAloud: 'Vorlesen',
    stopReading: 'Vorlesen stoppen',
    ttsNotSupported: 'Text-zu-Sprache wird in diesem Browser nicht unterstützt.',
    describeYourUi: 'Beschreibe deine UI',
    describeUiPlaceholder: 'z.B. Erstelle eine Login-Seite mit Benutzername, Passwort und Login-Button',
    pressCtrlEnter: 'Drücke Strg+Enter zum Generieren',
    tryExample: 'Probiere ein Beispiel',
    componentPicker: 'Komponenten-Auswahl',
    hide: 'Verbergen',
    browseAndAdd: 'Durchsuchen & hinzufügen ▾',
    searchComponentsPlaceholder: 'Komponenten suchen… (z.B. button, modal, input)',
    addComponentToPrompt: '{component} zur Eingabe hinzufügen',
    framework: 'Framework',
    generating: 'Generiere…',
    generateCode: 'Code generieren',
    componentsUsed: 'Verwendete Komponenten ({count})',
    generatedCode: 'Generierter Code',
    openInStackblitz: 'In StackBlitz Live-Sandbox öffnen',
    regenerateCode: 'Code neu generieren',
    regenerate: 'Neu generieren',
    downloadCode: 'Code herunterladen',
    download: 'Herunterladen',
    copyCode: 'Code kopieren',
    copied: 'Kopiert!',
    refinePlaceholder: 'Verfeinern: z.B. "Button sekundär machen" oder "Ladestatus hinzufügen"…',
    refineTitle: 'Verfeinere den generierten Code mit einer natürlichsprachlichen Anweisung',
    refine: 'Verfeinern',
    siemensKeyDescription: 'Verfügbar für alle Siemens-Mitarbeiter — keine Kreditkarte erforderlich. Erstelle deinen Schlüssel auf my.siemens.com → My Keys → Create, scope: llm.',
    siemensKeyLink: '↗ Hol dir deinen Siemens LLM API-Schlüssel (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'Hol dir deinen kostenlosen Groq API-Schlüssel auf console.groq.com. Groq bietet ultraschnelle Inferenz für Open-Weight-Modelle.',
    groqKeyLink: '↗ Hol dir deinen Groq API-Schlüssel (console.groq.com → API Keys)',
    keyLoadingLabel: 'Wird geladen…',
    keyDecrypting: 'Entschlüsseln…',
    siemensKeySavedEncrypted: '✅ Siemens API-Schlüssel (gespeichert & verschlüsselt)',
    enterSiemensApiKey: 'Gib deinen Siemens API-Schlüssel ein',
    removeKey: 'Schlüssel entfernen',
    saveKey: 'Schlüssel speichern',
    siemensSavedBadge: '✓ Siemens-Schlüssel gespeichert! KI-Funktionen freigeschaltet.',
    groqKeySavedEncrypted: '✅ Groq API-Schlüssel (gespeichert & verschlüsselt)',
    enterGroqApiKey: 'Gib deinen Groq API-Schlüssel ein',
    groqSavedBadge: '✓ Groq-Schlüssel gespeichert! KI-Funktionen freigeschaltet.',
    provider: 'Provider',
    model: 'Modell',
    keySavedSuffix: ' ✓ Schlüssel gespeichert',
    addKeyFirstSuffix: ' (zuerst Schlüssel hinzufügen)',
    free: 'Kostenlos',
    withKey: 'Mit Schlüssel',
    ixFaqAnswers: 'iX FAQ-Antworten',
    componentLookup: 'Komponenten-Suche',
    chatAnswers: 'Chat-Antworten',
    docsOnly: 'Nur Docs',
    aiLlm: 'KI (LLM)',
    codeGeneration: 'Code-Generierung',
    modelSelection: 'Modellauswahl',
    keysEncryptedPrefix: '🔒 Deine Schlüssel sind',
    keysEncryptedCore: 'AES-256-GCM verschlüsselt',
    keysEncryptedSuffix: 'bevor sie in localStorage gespeichert werden — niemals als Klartext. Schlüssel werden nur an den gewählten Provider-API-Endpunkt gesendet.',
    changeProviderModel: 'Provider und Modell ändern',
    addKeyInSettingsSuffix: ' (Schlüssel in Einstellungen hinzufügen)',
    accountTitle: '👤 Dein Konto',
    accountDescription: 'Verwalte dein iX AI Assistant-Profil und Einstellungen.',
    userName: 'Anzeigename',
    userNamePlaceholder: 'Gib deinen Namen ein (z.B. Max Mustermann)',
    userEmail: 'E-Mail-Adresse',
    userEmailPlaceholder: 'deine.email@siemens.com',
    userTheme: 'Theme-Einstellung',
    lightTheme: 'Hell',
    darkTheme: 'Dunkel',
    autoTheme: 'Auto (System)',
    notificationsEnabled: 'Benachrichtigungen aktivieren',
    notificationsDescription: 'Erhalte Benachrichtigungen, wenn Chat-Antworten bereit sind',
    saveProfile: 'Profil speichern',
    profileSaved: '✓ Profil erfolgreich gespeichert!',
    profileSaveError: 'Profil konnte nicht gespeichert werden. Bitte versuche es erneut.',
    accountStats: 'Deine Statistiken',
    chatSessions: 'Chat-Sitzungen',
    codeGenSessions: 'Code-Generierungen',
    questionsAsked: 'Gestellte Fragen',
      codeGenerated: 'Generierter Code',
      feedbackTitle: 'War das hilfreich?',
  },
  zh: {
    analyticsTitle: '使用分析',
    analyticsDescription: '跟踪常见问题以改进文档和产品指导。数据在内存中，服务器重启时重置。',
    loading: '加载中…',
    analyticsLoadError: '⚠️ 无法加载分析：{error}',
    queriesByFeature: '按功能查询',
    topQuestions: '热门问题',
    recentQueries: '最近查询',
    noQueriesYet: '尚未跟踪查询。使用聊天或代码生成来生成数据。',
    feature: '功能',
    queries: '查询',
    chat: '聊天', codeGen: '代码生成', account: '账户', more: '更多',
    moreOptions: '更多选项',
    history: '历史',
    clear: '清除',
    freeTier: '免费层',
    addApiKey: '添加 API 密钥',
    forAiResponses: '用于 AI 响应。',
    settings: '设置', help: '帮助', migrate: '迁移',
    openAssistant: '打开 AI 助手',
    closeAssistant: '关闭 AI 助手',
    assistantTitle: 'iX AI Assistant',
    send: '发送', askPlaceholder: '询问 Siemens iX 相关问题...', listening: '正在聆听…',
    settingsApiKey: '🔑 API 密钥',
    providerKeyToManage: '要管理的提供商密钥',
    providerModelTitle: '🤖 AI 提供商与模型',
    providerModelDescription: '独立配置聊天和代码生成。每个都可以使用不同的提供商和模型。',
    freeVsAi: '🆓 免费版 vs AI 助手',
    responseLanguageTitle: '🌍 回复语言',
    responseLanguageDescription: 'AI 将使用所选语言回复，代码示例始终保持原始语言。',
    docs: '查看文档', blog: '博客', support: '支持', starterApp: '入门应用',
    migrationTitle: '↔ 弃用迁移向导',
    migrationDescription: '粘贴使用已弃用 iX API 的代码。向导会分析并输出升级后的代码，包含逐行差异和简明迁移摘要。',
    migrationModeApi: 'API 迁移',
    migrationModeUpgrade: '版本升级',
    migrationUpgradeDescription: '在支持的 iX 版本之间升级代码。选择源版本和目标版本以获取指导和转换后的代码。',
    yourExistingCode: '你的现有代码',
    migrationPlaceholder: '粘贴使用已弃用 iX 组件或 API 的代码…',
    migrationUpgradePlaceholder: '粘贴要在 iX 版本之间升级的代码…',
    analyzing: '分析中…',
    analyzeAndMigrate: '分析并迁移',
    analyzeAndUpgrade: '分析并升级',
    summary: '摘要：',
    diff: '🔄 差异（旧 → 新）',
    migratedCode: '迁移后的代码',
    fromVersion: '源版本',
    toVersion: '目标版本',
    version: '版本',
    versionStatus: '状态',
    latest: '最新',
    maintenance: '维护中',
    endOfLife: '生命周期结束',
    released: '发布时间',
    maintenanceSince: '维护开始时间',
    eolSince: '生命周期结束时间',
    notApplicable: '-',
    upgradeVersionRequired: '请选择源版本和目标版本。',
    upgradeVersionOrderError: '目标版本必须比源版本新。',
    upgradeFromEolWarning: '⚠️ 源版本 {version} 已停止维护。建议尽快升级。',
    upgradePathHint: 'V2.0.0 的推荐路径：先升级到 V3.0.0，然后再升级到 V4.0.0。',
    showVersionTable: '显示版本表',
    hideVersionTable: '隐藏版本表',
    copy: '复制',
    voiceInputNotSupported: '此浏览器不支持语音输入。',
    voiceRecognitionError: '语音识别错误。请重试。',
    deprecationHint: '⚠️ 检测到已弃用的 API：{names}。机器人将建议正确的替代方案。',
    chatCleared: '聊天已清除。问我任何关于 Siemens iX 的问题！',
    codeGenerationNeedsKey: '🔑 代码生成需要 AI 模型。在 ⚙️ 设置选项卡中添加你的 AI API 密钥以解锁此功能。',
    deprecationWarningCodegen: '⚠️ 一些匹配的组件包含弃用通知。请仔细查看生成的代码注释并检查迁移指南。',
    noCodeGenerated: '未生成代码。',
    somethingWentWrong: '出现错误',
    couldNotDownloadGenerated: '无法下载生成的内容。',
    refinementNeedsKey: '🔑 代码优化需要 API 密钥——在 ⚙️ 设置中添加一个。',
    refinementFailed: '优化失败',
    migrationNeedsKey: '🔑 迁移分析需要 API 密钥——在 ⚙️ 设置中添加一个。',
    migrationFailed: '迁移分析失败',
    migrationRequiresApiKey: '🔑 迁移需要 API 密钥。添加一个在',
    settingsArrow: '⚙️ 设置 →',
    chatHistory: '聊天历史',
    noSavedChatSessions: '还没有保存的会话。清除或开始新对话时会保存聊天会话。',
    codeGenHistory: '代码生成历史',
    noSavedCodegenSessions: '还没有保存的生成。清除或开始新生成时会保存代码会话。',
    restore: '恢复',
    delete: '删除',
    you: '你',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️此回复提到了已弃用的 API 或重大变更。查看迁移文档。',
    sourcesLabel: '来源：',
    thinking: '思考中…',
    stopListening: '停止听',
    voiceInput: '语音输入',
    stopVoiceInput: '停止语音输入',
    startVoiceInput: '开始语音输入',
    readAloud: '朗读',
    stopReading: '停止朗读',
    ttsNotSupported: '此浏览器不支持文本转语音。',
    describeYourUi: '描述你的 UI',
    describeUiPlaceholder: '例如：创建一个带有用户名、密码和登录按钮的登录页面',
    pressCtrlEnter: '按 Ctrl+Enter 生成',
    tryExample: '尝试一个示例',
    componentPicker: '组件选择器',
    hide: '隐藏',
    browseAndAdd: '浏览并添加 ▾',
    searchComponentsPlaceholder: '搜索组件…（例如 button、modal、input）',
    addComponentToPrompt: '将 {component} 添加到提示',
    framework: '框架',
    generating: '生成中…',
    generateCode: '生成代码',
    componentsUsed: '使用的组件 ({count})',
    generatedCode: '生成的代码',
    openInStackblitz: '在 StackBlitz 实时沙盒中打开',
    regenerateCode: '重新生成代码',
    regenerate: '重新生成',
    downloadCode: '下载代码',
    download: '下载',
    copyCode: '复制代码',
    copied: '已复制！',
    refinePlaceholder: '优化：例如“将按钮改为次要按钮”或“添加加载状态”…',
    refineTitle: '使用自然语言指令优化生成的代码',
    refine: '优化',
    siemensKeyDescription: '适用于每位 Siemens 员工——无需信用卡。在 my.siemens.com → My Keys → Create 生成密钥，scope: llm。',
    siemensKeyLink: '↗ 获取你的 Siemens LLM API 密钥 (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: '在 console.groq.com 获取你的免费 Groq API 密钥。Groq 为开放权重模型提供超快推理。',
    groqKeyLink: '↗ 获取你的 Groq API 密钥 (console.groq.com → API Keys)',
    keyLoadingLabel: '加载中…',
    keyDecrypting: '解密中…',
    siemensKeySavedEncrypted: '✅ Siemens API 密钥（已保存并加密）',
    enterSiemensApiKey: '输入你的 Siemens API 密钥',
    removeKey: '移除密钥',
    saveKey: '保存密钥',
    siemensSavedBadge: '✓ Siemens 密钥已保存！AI 功能已解锁。',
    groqKeySavedEncrypted: '✅ Groq API 密钥（已保存并加密）',
    enterGroqApiKey: '输入你的 Groq API 密钥',
    groqSavedBadge: '✓ Groq 密钥已保存！AI 功能已解锁。',
    provider: '提供商',
    model: '模型',
    keySavedSuffix: ' ✓ 密钥已保存',
    addKeyFirstSuffix: ' （请先添加密钥）',
    free: '免费',
    withKey: '使用密钥',
    ixFaqAnswers: 'iX FAQ 回答',
    componentLookup: '组件查找',
    chatAnswers: '聊天回答',
    docsOnly: '仅文档',
    aiLlm: 'AI（LLM）',
    codeGeneration: '代码生成',
    modelSelection: '模型选择',
    keysEncryptedPrefix: '🔒 你的密钥已',
    keysEncryptedCore: 'AES-256-GCM 加密',
    keysEncryptedSuffix: '在保存到 localStorage 之前——从不以明文存储。密钥仅发送到所选提供商的 API 端点。',
    changeProviderModel: '更改提供商和模型',
    addKeyInSettingsSuffix: ' （在设置中添加密钥）',
    accountTitle: '👤 你的账户',
    accountDescription: '管理你的 iX AI Assistant 配置文件和偏好设置。',
    userName: '显示名称',
    userNamePlaceholder: '输入你的姓名（例如：张三）',
    userEmail: '电子邮件地址',
    userEmailPlaceholder: 'your.email@siemens.com',
    userTheme: '主题偏好',
    lightTheme: '浅色',
    darkTheme: '深色',
    autoTheme: '自动（系统）',
    notificationsEnabled: '启用通知',
    notificationsDescription: '在聊天回复准备就绪时收到通知',
    saveProfile: '保存配置文件',
    profileSaved: '✓ 配置文件保存成功！',
    profileSaveError: '保存配置文件失败。请重试。',
    accountStats: '你的统计数据',
    chatSessions: '聊天会话',
    codeGenSessions: '代码生成',
    questionsAsked: '提出的问题',
      codeGenerated: '生成的代码',
      feedbackTitle: '这有帮助吗？',
  },
  fr: {
    chat: 'Chat', codeGen: 'Génération de code', more: 'Plus', settings: 'Paramètres', help: 'Aide', migrate: 'Migrer',
    responseLanguageTitle: '🌍 Langue de réponse',
    responseLanguageDescription: 'L’IA répond dans la langue sélectionnée. Les exemples de code restent dans leur langue d’origine.',
    send: 'Envoyer', askPlaceholder: 'Posez une question sur Siemens iX...', listening: 'Écoute…',
    analyticsTitle: 'Analytique d’usage',
    analyticsDescription: 'Suivez les questions fréquentes pour améliorer la documentation et les conseils produit. Les données sont en mémoire et réinitialisées au redémarrage du serveur.',
    loading: 'Chargement…',
    analyticsLoadError: '⚠️ Impossible de charger l’analytique : {error}',
    queriesByFeature: 'Requêtes par fonctionnalité',
    topQuestions: 'Questions fréquentes',
    recentQueries: 'Requêtes récentes',
    noQueriesYet: 'Aucune requête suivie pour le moment. Utilisez Chat ou Génération de code pour générer des données.',
    feature: 'Fonctionnalité',
    queries: 'Requêtes',
    settingsApiKey: '🔑 Clé API',
    providerKeyToManage: 'Clé du fournisseur à gérer',
    providerModelTitle: '🤖 Fournisseur IA & modèle',
    providerModelDescription: 'Configurez Chat et Code Gen indépendamment. Chacun peut utiliser un fournisseur et un modèle différents.',
    freeVsAi: '🆓 Gratuit vs Assistant IA',
    docs: 'Aller à la doc', blog: 'Blog', support: 'Support', starterApp: 'Starter app',
    migrationTitle: '↔ Assistant de migration',
    migrationDescription: 'Collez du code utilisant des API iX obsolètes. L\'assistant l\'analyse et génère un code mis à jour avec un diff ligne par ligne et un résumé de migration.',
    migrationModeApi: 'Migration d\'API',
    migrationModeUpgrade: 'Mise à niveau de version',
    migrationUpgradeDescription: 'Mettez à niveau le code entre les versions iX prises en charge. Sélectionnez les versions source et cible pour obtenir des conseils et du code transformé.',
    yourExistingCode: 'Votre code existant',
    migrationPlaceholder: 'Collez du code utilisant des composants ou API iX obsolètes…',
    migrationUpgradePlaceholder: 'Collez le code à mettre à niveau entre les versions iX…',
    analyzing: 'Analyse en cours…',
    analyzeAndMigrate: 'Analyser & migrer',
    analyzeAndUpgrade: 'Analyser et mettre à niveau',
    summary: 'Résumé :',
    diff: '🔄 Diff (ancien → nouveau)',
    migratedCode: 'Code migré',
    fromVersion: 'Version source',
    toVersion: 'Version cible',
    version: 'Version',
    versionStatus: 'Statut',
    latest: 'Dernière',
    maintenance: 'Maintenance',
    endOfLife: 'Fin de vie',
    released: 'Publié',
    maintenanceSince: 'Maintenance depuis',
    eolSince: 'Fin de vie depuis',
    notApplicable: '-',
    upgradeVersionRequired: 'Sélectionnez les versions source et cible.',
    upgradeVersionOrderError: 'La version cible doit être plus récente que la version source.',
    upgradeFromEolWarning: '⚠️ La version source {version} est en fin de vie. La mise à niveau est recommandée dès que possible.',
    upgradePathHint: 'Chemin recommandé pour V2.0.0 : mettre à niveau vers V3.0.0 d\'abord, puis vers V4.0.0.',
    showVersionTable: 'Afficher le tableau des versions',
    hideVersionTable: 'Masquer le tableau des versions',
    copy: 'Copier',
    voiceInputNotSupported: 'L\'entrée vocale n\'est pas prise en charge dans ce navigateur.',
    voiceRecognitionError: 'Erreur de reconnaissance vocale. Veuillez réessayer.',
    deprecationHint: '⚠️ API obsolète détectée : {names}. Le bot suggérera le remplacement correct.',
    chatCleared: 'Chat effacé. Posez-moi n\'importe quelle question sur Siemens iX !',
    codeGenerationNeedsKey: '🔑 La génération de code nécessite un modèle IA. Ajoutez votre clé API IA dans l\'onglet ⚙️ Paramètres pour débloquer cette fonctionnalité.',
    deprecationWarningCodegen: '⚠️ Certains composants correspondants contiennent des avis de dépréciation. Examinez attentivement les commentaires du code généré et consultez le guide de migration.',
    noCodeGenerated: 'Aucun code généré.',
    somethingWentWrong: 'Quelque chose s\'est mal passé',
    couldNotDownloadGenerated: 'Impossible de télécharger le contenu généré.',
    refinementNeedsKey: '🔑 Le raffinement du code nécessite une clé API — ajoutez-en une dans ⚙️ Paramètres.',
    refinementFailed: 'Échec du raffinement',
    migrationNeedsKey: '🔑 L\'analyse de migration nécessite une clé API — ajoutez-en une dans ⚙️ Paramètres.',
    migrationFailed: 'Échec de l\'analyse de migration',
    migrationRequiresApiKey: '🔑 La migration nécessite une clé API. Ajoutez-en une dans',
    settingsArrow: '⚙️ Paramètres →',
    chatHistory: 'Historique du chat',
    noSavedChatSessions: 'Aucune session enregistrée pour le moment. Les sessions de chat sont enregistrées lorsque vous effacez ou démarrez une nouvelle conversation.',
    codeGenHistory: 'Historique de génération de code',
    noSavedCodegenSessions: 'Aucune génération enregistrée pour le moment. Les sessions de code sont enregistrées lorsque vous effacez ou démarrez une nouvelle génération.',
    restore: 'Restaurer',
    delete: 'Supprimer',
    you: 'Vous',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ Cette réponse mentionne des API obsolètes ou des changements cassants. Consultez les docs de migration.',
    sourcesLabel: 'Sources :',
    thinking: 'Réflexion…',
    stopListening: 'Arrêter d\'\u00e9couter',
    voiceInput: 'Entrée vocale',
    stopVoiceInput: 'Arrêter l\'entrée vocale',
    startVoiceInput: 'Démarrer l\'entrée vocale',
    readAloud: 'Lire à voix haute',
    stopReading: 'Arrêter la lecture',
    ttsNotSupported: 'La synthèse vocale n\'est pas prise en charge dans ce navigateur.',
    describeYourUi: 'Décrivez votre interface',
    describeUiPlaceholder: 'ex. : Créer une page de connexion avec nom d\'utilisateur, mot de passe et bouton de connexion',
    pressCtrlEnter: 'Appuyez sur Ctrl+Entrée pour générer',
    tryExample: 'Essayer un exemple',
    componentPicker: 'Sélecteur de composants',
    hide: 'Masquer',
    browseAndAdd: 'Parcourir et ajouter ▾',
    searchComponentsPlaceholder: 'Rechercher des composants… (ex. : button, modal, input)',
    addComponentToPrompt: 'Ajouter {component} à l\'invite',
    framework: 'Framework',
    generating: 'Génération…',
    generateCode: 'Générer le code',
    componentsUsed: 'Composants utilisés ({count})',
    generatedCode: 'Code généré',
    openInStackblitz: 'Ouvrir dans le bac à sable en direct StackBlitz',
    regenerateCode: 'Regénérer le code',
    regenerate: 'Regénérer',
    downloadCode: 'Télécharger le code',
    download: 'Télécharger',
    copyCode: 'Copier le code',
    copied: 'Copié !',
    refinePlaceholder: 'Affiner : par ex. "rendre le bouton secondaire" ou "ajouter un état de chargement"…',
    refineTitle: 'Affinez le code généré avec une instruction en langage naturel',
    refine: 'Affiner',
    siemensKeyDescription: 'Disponible pour chaque employé Siemens — aucune carte de crédit nécessaire. Générez votre clé sur my.siemens.com → My Keys → Create, scope: llm.',
    siemensKeyLink: '↗ Obtenez votre clé API LLM Siemens (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'Obtenez votre clé API Groq gratuite sur console.groq.com. Groq fournit une inférence ultra-rapide pour les modèles ouverts.',
    groqKeyLink: '↗ Obtenez votre clé API Groq (console.groq.com → API Keys)',
    keyLoadingLabel: 'Chargement…',
    keyDecrypting: 'Décryptage…',
    siemensKeySavedEncrypted: '✅ Clé API Siemens (enregistrée et cryptée)',
    enterSiemensApiKey: 'Entrez votre clé API Siemens',
    removeKey: 'Supprimer la clé',
    saveKey: 'Enregistrer la clé',
    siemensSavedBadge: '✓ Clé Siemens enregistrée ! Fonctionnalités IA débloquées.',
    groqKeySavedEncrypted: '✅ Clé API Groq (enregistrée et cryptée)',
    enterGroqApiKey: 'Entrez votre clé API Groq',
    groqSavedBadge: '✓ Clé Groq enregistrée ! Fonctionnalités IA débloquées.',
    provider: 'Fournisseur',
    model: 'Modèle',
    keySavedSuffix: ' ✓ clé enregistrée',
    addKeyFirstSuffix: ' (ajoutez d\'abord une clé)',
    free: 'Gratuit',
    withKey: 'Avec clé',
    ixFaqAnswers: 'Réponses FAQ iX',
    componentLookup: 'Recherche de composants',
    chatAnswers: 'Réponses du chat',
    docsOnly: 'Docs uniquement',
    aiLlm: 'IA (LLM)',
    codeGeneration: 'Génération de code',
    modelSelection: 'Sélection du modèle',
    keysEncryptedPrefix: '🔒 Vos clés sont',
    keysEncryptedCore: 'chiffrées en AES-256-GCM',
    keysEncryptedSuffix: 'avant d\'\u00eatre sauvegardées dans localStorage — jamais stockées en texte brut. Les clés sont uniquement envoyées à l\'endpoint API du fournisseur choisi.',
    changeProviderModel: 'Changer le fournisseur et le modèle',
    addKeyInSettingsSuffix: ' (ajoutez une clé dans Paramètres)',
    accountTitle: '👤 Votre Compte',
    accountDescription: 'Gérez votre profil et préférences iX AI Assistant.',
    userName: 'Nom d\'affichage',
    userNamePlaceholder: 'Entrez votre nom (ex. : Jean Dupont)',
    userEmail: 'Adresse e-mail',
    userEmailPlaceholder: 'votre.email@siemens.com',
    userTheme: 'Préférence de thème',
    lightTheme: 'Clair',
    darkTheme: 'Sombre',
    autoTheme: 'Auto (Système)',
    notificationsEnabled: 'Activer les notifications',
    notificationsDescription: 'Recevez des notifications lorsque les réponses du chat sont prêtes',
    saveProfile: 'Enregistrer le profil',
    profileSaved: '✓ Profil enregistré avec succès !',
    profileSaveError: 'Échec de l\'enregistrement du profil. Veuillez réessayer.',
    accountStats: 'Vos Statistiques',
    chatSessions: 'Sessions de chat',
    codeGenSessions: 'Générations de code',
    questionsAsked: 'Questions posées',
      codeGenerated: 'Code généré',
      feedbackTitle: 'Cela vous a-t-il aidé ?',
  },
  es: {
    chat: 'Chat', codeGen: 'Gen. de código', more: 'Más', settings: 'Ajustes', help: 'Ayuda', migrate: 'Migrar',
    responseLanguageTitle: '🌍 Idioma de respuesta',
    responseLanguageDescription: 'La IA responderá en el idioma seleccionado. Los ejemplos de código se mantienen en su idioma original.',
    send: 'Enviar', askPlaceholder: 'Pregunta sobre Siemens iX...', listening: 'Escuchando…',
    analyticsTitle: 'Analítica de uso',
    analyticsDescription: 'Haz seguimiento de las preguntas comunes para mejorar la documentación y la orientación del producto. Los datos están en memoria y se reinician al reiniciar el servidor.',
    loading: 'Cargando…',
    analyticsLoadError: '⚠️ No se pudo cargar la analítica: {error}',
    queriesByFeature: 'Consultas por función',
    topQuestions: 'Preguntas principales',
    recentQueries: 'Consultas recientes',
    noQueriesYet: 'Aún no hay consultas registradas. Usa Chat o Gen. de código para generar datos.',
    feature: 'Función',
    queries: 'Consultas',
    settingsApiKey: '🔑 Clave API',
    providerKeyToManage: 'Clave de proveedor a gestionar',
    providerModelTitle: '🤖 Proveedor IA y modelo',
    providerModelDescription: 'Configura Chat y Code Gen de forma independiente. Cada uno puede usar un proveedor y modelo diferentes.',
    freeVsAi: '🆓 Gratis vs Asistente IA',
    docs: 'Ir a la documentación', blog: 'Blog', support: 'Soporte', starterApp: 'App inicial',
    migrationTitle: '↔ Asistente de migración',
    migrationDescription: 'Pega código que use API de iX obsoletas. El asistente lo analiza y genera código actualizado con diferencias línea por línea y un resumen de migración.',
    migrationModeApi: 'Migración de API',
    migrationModeUpgrade: 'Actualización de versión',
    migrationUpgradeDescription: 'Actualiza código entre versiones soportadas de iX. Selecciona las versiones de origen y destino para obtener orientación y código transformado.',
    yourExistingCode: 'Tu código actual',
    migrationPlaceholder: 'Pega código que use componentes o API de iX obsoletas…',
    migrationUpgradePlaceholder: 'Pega código para actualizar entre versiones de iX…',
    analyzing: 'Analizando…',
    analyzeAndMigrate: 'Analizar y migrar',
    analyzeAndUpgrade: 'Analizar y actualizar',
    summary: 'Resumen:',
    diff: '🔄 Diff (anterior → nuevo)',
    migratedCode: 'Código migrado',
    fromVersion: 'Versión de origen',
    toVersion: 'Versión de destino',
    version: 'Versión',
    versionStatus: 'Estado',
    latest: 'Última',
    maintenance: 'Mantenimiento',
    endOfLife: 'Fin de vida',
    released: 'Lanzado',
    maintenanceSince: 'Mantenimiento desde',
    eolSince: 'Fin de vida desde',
    notApplicable: '-',
    upgradeVersionRequired: 'Selecciona ambas versiones de origen y destino.',
    upgradeVersionOrderError: 'La versión de destino debe ser más reciente que la versión de origen.',
    upgradeFromEolWarning: '⚠️ La versión de origen {version} está en fin de vida. Se recomienda actualizar lo antes posible.',
    upgradePathHint: 'Ruta recomendada para V2.0.0: actualizar primero a V3.0.0, luego a V4.0.0.',
    showVersionTable: 'Mostrar tabla de versiones',
    hideVersionTable: 'Ocultar tabla de versiones',
    copy: 'Copiar',
    voiceInputNotSupported: 'La entrada de voz no es compatible con este navegador.',
    voiceRecognitionError: 'Error de reconocimiento de voz. Por favor, inténtalo de nuevo.',
    deprecationHint: '⚠️ API obsoleta detectada: {names}. El bot sugerirá el reemplazo correcto.',
    chatCleared: 'Chat limpiado. ¡Pregúntame cualquier cosa sobre Siemens iX!',
    codeGenerationNeedsKey: '🔑 La generación de código requiere un modelo de IA. Agrega tu clave API de IA en la pestaña ⚙️ Ajustes para desbloquear esta función.',
    deprecationWarningCodegen: '⚠️ Algunos componentes coincidentes contienen avisos de obsolescencia. Revisa los comentarios del código generado cuidadosamente y consulta la guía de migración.',
    noCodeGenerated: 'No se generó código.',
    somethingWentWrong: 'Algo salió mal',
    couldNotDownloadGenerated: 'No se pudo descargar el contenido generado.',
    refinementNeedsKey: '🔑 El refinamiento de código requiere una clave API — agrega una en ⚙️ Ajustes.',
    refinementFailed: 'Refinamiento fallido',
    migrationNeedsKey: '🔑 El análisis de migración requiere una clave API — agrega una en ⚙️ Ajustes.',
    migrationFailed: 'Análisis de migración fallido',
    migrationRequiresApiKey: '🔑 La migración requiere una clave API. Agrega una en',
    settingsArrow: '⚙️ Ajustes →',
    chatHistory: 'Historial de chat',
    noSavedChatSessions: 'Aún no hay sesiones guardadas. Las sesiones de chat se guardan cuando limpias o inicias una nueva conversación.',
    codeGenHistory: 'Historial de generación de código',
    noSavedCodegenSessions: 'Aún no hay generaciones guardadas. Las sesiones de código se guardan cuando limpias o inicias una nueva generación.',
    restore: 'Restaurar',
    delete: 'Eliminar',
    you: 'Tú',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ Esta respuesta menciona API obsoletas o cambios importantes. Consulta los documentos de migración.',
    sourcesLabel: 'Fuentes:',
    thinking: 'Pensando…',
    stopListening: 'Dejar de escuchar',
    voiceInput: 'Entrada de voz',
    stopVoiceInput: 'Detener entrada de voz',
    startVoiceInput: 'Iniciar entrada de voz',
    readAloud: 'Leer en voz alta',
    stopReading: 'Detener lectura',
    ttsNotSupported: 'La conversión de texto a voz no es compatible con este navegador.',
    describeYourUi: 'Describe tu interfaz',
    describeUiPlaceholder: 'ej.: Crear una página de inicio de sesión con nombre de usuario, contraseña y botón de inicio de sesión',
    pressCtrlEnter: 'Presiona Ctrl+Enter para generar',
    tryExample: 'Probar un ejemplo',
    componentPicker: 'Selector de componentes',
    hide: 'Ocultar',
    browseAndAdd: 'Explorar y agregar ▾',
    searchComponentsPlaceholder: 'Buscar componentes… (ej.: button, modal, input)',
    addComponentToPrompt: 'Agregar {component} a la solicitud',
    framework: 'Framework',
    generating: 'Generando…',
    generateCode: 'Generar código',
    componentsUsed: 'Componentes usados ({count})',
    generatedCode: 'Código generado',
    openInStackblitz: 'Abrir en sandbox en vivo de StackBlitz',
    regenerateCode: 'Regenerar código',
    regenerate: 'Regenerar',
    downloadCode: 'Descargar código',
    download: 'Descargar',
    copyCode: 'Copiar código',
    copied: '¡Copiado!',
    accountTitle: '👤 Tu Cuenta',
    accountDescription: 'Administra tu perfil y preferencias de iX AI Assistant.',
    userName: 'Nombre para mostrar',
    userNamePlaceholder: 'Ingresa tu nombre (ej.: Juan Pérez)',
    userEmail: 'Dirección de correo electrónico',
    userEmailPlaceholder: 'tu.email@siemens.com',
    userTheme: 'Preferencia de tema',
    lightTheme: 'Claro',
    darkTheme: 'Oscuro',
    autoTheme: 'Auto (Sistema)',
    notificationsEnabled: 'Habilitar notificaciones',
    notificationsDescription: 'Recibe notificaciones cuando las respuestas del chat estén listas',
    saveProfile: 'Guardar perfil',
    profileSaved: '✓ ¡Perfil guardado exitosamente!',
    profileSaveError: 'Error al guardar el perfil. Por favor, inténtalo de nuevo.',
    accountStats: 'Tus Estadísticas',
    chatSessions: 'Sesiones de chat',
    codeGenSessions: 'Generaciones de código',
    questionsAsked: 'Preguntas realizadas',
      codeGenerated: 'Código generado',
      feedbackTitle: '¿Te resultó útil?',
    refinePlaceholder: 'Refinar: ej. "hacer el botón secundario" o "agregar un estado de carga"…',
    refineTitle: 'Refina el código generado con una instrucción en lenguaje natural',
    refine: 'Refinar',
    siemensKeyDescription: 'Disponible para cada empleado de Siemens — no se necesita tarjeta de crédito. Genera tu clave en my.siemens.com → My Keys → Create, scope: llm.',
    siemensKeyLink: '↗ Obtén tu clave API LLM de Siemens (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'Obtén tu clave API de Groq gratuita en console.groq.com. Groq proporciona inferencia ultrarrápida para modelos de pesos abiertos.',
    groqKeyLink: '↗ Obtén tu clave API de Groq (console.groq.com → API Keys)',
    keyLoadingLabel: 'Cargando…',
    keyDecrypting: 'Descifrando…',
    siemensKeySavedEncrypted: '✅ Clave API de Siemens (guardada y encriptada)',
    enterSiemensApiKey: 'Ingresa tu clave API de Siemens',
    removeKey: 'Eliminar clave',
    saveKey: 'Guardar clave',
    siemensSavedBadge: '✓ ¡Clave de Siemens guardada! Funciones de IA desbloqueadas.',
    groqKeySavedEncrypted: '✅ Clave API de Groq (guardada y encriptada)',
    enterGroqApiKey: 'Ingresa tu clave API de Groq',
    groqSavedBadge: '✓ ¡Clave de Groq guardada! Funciones de IA desbloqueadas.',
    provider: 'Proveedor',
    model: 'Modelo',
    keySavedSuffix: ' ✓ clave guardada',
    addKeyFirstSuffix: ' (primero agrega una clave)',
    free: 'Gratis',
    withKey: 'Con clave',
    ixFaqAnswers: 'Respuestas FAQ de iX',
    componentLookup: 'Búsqueda de componentes',
    chatAnswers: 'Respuestas del chat',
    docsOnly: 'Solo docs',
    aiLlm: 'IA (LLM)',
    codeGeneration: 'Generación de código',
    modelSelection: 'Selección de modelo',
    keysEncryptedPrefix: '🔒 Tus claves están',
    keysEncryptedCore: 'encriptadas con AES-256-GCM',
    keysEncryptedSuffix: 'antes de guardarse en localStorage — nunca almacenadas como texto plano. Las claves solo se envían al endpoint API del proveedor elegido.',
    changeProviderModel: 'Cambiar proveedor y modelo',
    addKeyInSettingsSuffix: ' (agregar clave en Ajustes)',
  },
  ja: {
    chat: 'チャット', codeGen: 'コード生成', more: 'その他', settings: '設定', help: 'ヘルプ', migrate: '移行',
    responseLanguageTitle: '🌍 応答言語',
    responseLanguageDescription: 'AI は選択した言語で回答します。コード例は元の言語のままです。',
    send: '送信', askPlaceholder: 'Siemens iX について質問...', listening: '音声入力中…',
    analyticsTitle: '利用分析',
    analyticsDescription: 'よくある質問を追跡して、ドキュメントと製品ガイダンスを改善します。データはメモリ上に保持され、サーバー再起動時にリセットされます。',
    loading: '読み込み中…',
    analyticsLoadError: '⚠️ 分析を読み込めませんでした: {error}',
    queriesByFeature: '機能別クエリ',
    topQuestions: 'よくある質問',
    recentQueries: '最近の問い合わせ',
    noQueriesYet: 'まだクエリは追跡されていません。チャットまたはコード生成を使ってデータを作成してください。',
    feature: '機能',
    queries: 'クエリ',
    settingsApiKey: '🔑 API キー',
    providerKeyToManage: '管理するプロバイダーキー',
    providerModelTitle: '🤖 AI プロバイダーとモデル',
    providerModelDescription: 'チャットとコード生成を個別に設定します。それぞれ異なるプロバイダーとモデルを使用できます。',
    freeVsAi: '🆓 無料版とAIアシスタント',
    docs: 'ドキュメントへ', blog: 'ブログ', support: 'サポート', starterApp: 'スターターアプリ',
    migrationTitle: '↔ 非推奨移行ウィザード',
    migrationDescription: '非推奨の iX API を使用しているコードを貼り付けます。ウィザードが分析し、行ごとの差分と分かりやすい移行概要とともにアップグレードされたコードを出力します。',
    migrationModeApi: 'API 移行',
    migrationModeUpgrade: 'バージョンアップグレード',
    migrationUpgradeDescription: 'サポートされている iX バージョン間でコードをアップグレードします。ソースとターゲットのバージョンを選択して、ガイダンスと変換されたコードを取得します。',
    yourExistingCode: '既存コード',
    migrationPlaceholder: '非推奨の iX コンポーネントまたは API を使用しているコードを貼り付け…',
    migrationUpgradePlaceholder: 'iX バージョン間でアップグレードするコードを貼り付け…',
    analyzing: '解析中…',
    analyzeAndMigrate: '解析して移行',
    analyzeAndUpgrade: '解析してアップグレード',
    summary: '概要：',
    diff: '🔄 差分（旧 → 新）',
    migratedCode: '移行後コード',
    fromVersion: 'ソースバージョン',
    toVersion: 'ターゲットバージョン',
    version: 'バージョン',
    versionStatus: 'ステータス',
    latest: '最新',
    maintenance: 'メンテナンス',
    endOfLife: 'サポート終了',
    released: 'リリース',
    maintenanceSince: 'メンテナンス開始',
    eolSince: 'サポート終了日',
    notApplicable: '-',
    upgradeVersionRequired: 'ソースバージョンとターゲットバージョンの両方を選択してください。',
    upgradeVersionOrderError: 'ターゲットバージョンはソースバージョンより新しい必要があります。',
    upgradeFromEolWarning: '⚠️ ソースバージョン {version} はサポート終了です。できるだけ早くアップグレードすることをお勧めします。',
    upgradePathHint: 'V2.0.0 の推奨パス：まず V3.0.0 にアップグレードし、次に V4.0.0 にアップグレードします。',
    showVersionTable: 'バージョン表を表示',
    hideVersionTable: 'バージョン表を非表示',
    copy: 'コピー',
    voiceInputNotSupported: 'このブラウザでは音声入力がサポートされていません。',
    voiceRecognitionError: '音声認識エラー。もう一度お試しください。',
    deprecationHint: '⚠️ 非推奨 API が検出されました：{names}。ボットが正しい置き換えを提案します。',
    chatCleared: 'チャットをクリアしました。Siemens iX について何でも質問してください！',
    codeGenerationNeedsKey: '🔑 コード生成には AI モデルが必要です。⚙️ 設定タブで AI API キーを追加してこの機能をアンロックしてください。',
    deprecationWarningCodegen: '⚠️ 一部の一致するコンポーネントには非推奨通知が含まれています。生成されたコードのコメントを注意深く確認し、移行ガイドを確認してください。',
    noCodeGenerated: 'コードが生成されませんでした。',
    somethingWentWrong: '何かがうまくいきませんでした',
    couldNotDownloadGenerated: '生成されたコンテンツをダウンロードできませんでした。',
    refinementNeedsKey: '🔑 コードの改善には API キーが必要です——⚙️ 設定で追加してください。',
    refinementFailed: '改善に失敗しました',
    migrationNeedsKey: '🔑 移行分析には API キーが必要です——⚙️ 設定で追加してください。',
    migrationFailed: '移行分析に失敗しました',
    migrationRequiresApiKey: '🔑 移行には API キーが必要です。次の場所で追加してください',
    settingsArrow: '⚙️ 設定 →',
    chatHistory: 'チャット履歴',
    noSavedChatSessions: '保存されたセッションはまだありません。チャットセッションはクリアするか新しい会話を開始すると保存されます。',
    codeGenHistory: 'コード生成履歴',
    noSavedCodegenSessions: '保存された生成はまだありません。コードセッションはクリアするか新しい生成を開始すると保存されます。',
    restore: '復元',
    delete: '削除',
    you: 'あなた',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ この応答は非推奨 API または破壊的変更について言及しています。移行ドキュメントを確認してください。',
    sourcesLabel: 'ソース：',
    thinking: '考え中…',
    stopListening: '聴取を停止',
    voiceInput: '音声入力',
    stopVoiceInput: '音声入力を停止',
    startVoiceInput: '音声入力を開始',
    readAloud: '音読',
    stopReading: '読み上げを停止',
    ttsNotSupported: 'このブラウザはテキスト読み上げに対応していません。',
    describeYourUi: 'UI を説明してください',
    describeUiPlaceholder: '例：ユーザー名、パスワード、ログインボタンを含むログインページを作成',
    pressCtrlEnter: 'Ctrl+Enter で生成',
    tryExample: '例を試す',
    componentPicker: 'コンポーネントピッカー',
    hide: '非表示',
    browseAndAdd: '参照して追加 ▾',
    searchComponentsPlaceholder: 'コンポーネントを検索…（例：button、modal、input）',
    addComponentToPrompt: '{component} をプロンプトに追加',
    framework: 'フレームワーク',
    generating: '生成中…',
    generateCode: 'コードを生成',
    componentsUsed: '使用されたコンポーネント ({count})',
    generatedCode: '生成されたコード',
    openInStackblitz: 'StackBlitz ライブサンドボックスで開く',
    regenerateCode: 'コードを再生成',
    regenerate: '再生成',
    downloadCode: 'コードをダウンロード',
    download: 'ダウンロード',
    copyCode: 'コードをコピー',
    copied: 'コピーしました！',
    refinePlaceholder: '改善：例「ボタンをセカンダリにする」または「ローディング状態を追加」…',
    refineTitle: '自然言語の指示で生成されたコードを改善',
    refine: '改善',
    siemensKeyDescription: 'すべての Siemens 従業員が利用可能——クレジットカード不要。my.siemens.com → My Keys → Createでキーを生成、scope: llm。',
    siemensKeyLink: '↗ Siemens LLM API キーを取得 (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'console.groq.com で無料の Groq API キーを取得します。Groq はオープンウェイトモデルに超高速推論を提供します。',
    groqKeyLink: '↗ Groq API キーを取得 (console.groq.com → API Keys)',
    keyLoadingLabel: '読み込み中…',
    keyDecrypting: '復号化中…',
    siemensKeySavedEncrypted: '✅ Siemens API キー（保存済み・暗号化済み）',
    enterSiemensApiKey: 'Siemens API キーを入力',
    removeKey: 'キーを削除',
    saveKey: 'キーを保存',
    siemensSavedBadge: '✓ Siemens キーが保存されました！AI 機能がアンロックされました。',
    groqKeySavedEncrypted: '✅ Groq API キー（保存済み・暗号化済み）',
    enterGroqApiKey: 'Groq API キーを入力',
    groqSavedBadge: '✓ Groq キーが保存されました！AI 機能がアンロックされました。',
    provider: 'プロバイダー',
    model: 'モデル',
    keySavedSuffix: ' ✓ キー保存済み',
    addKeyFirstSuffix: ' （まずキーを追加）',
    free: '無料',
    withKey: 'キー付き',
    ixFaqAnswers: 'iX FAQ 回答',
    componentLookup: 'コンポーネント検索',
    chatAnswers: 'チャット回答',
    docsOnly: 'ドキュメントのみ',
    aiLlm: 'AI (LLM)',
    codeGeneration: 'コード生成',
    modelSelection: 'モデル選択',
    keysEncryptedPrefix: '🔒 キーは',
    keysEncryptedCore: 'AES-256-GCM で暗号化',
    keysEncryptedSuffix: 'localStorage に保存される前に——平文で保存されることはありません。キーは選択したプロバイダーの API エンドポイントにのみ送信されます。',
    changeProviderModel: 'プロバイダーとモデルを変更',
    addKeyInSettingsSuffix: ' （設定でキーを追加）',
    accountTitle: '👤 あなたのアカウント',
    accountDescription: 'iX AI Assistant のプロフィールと設定を管理します。',
    userName: '表示名',
    userNamePlaceholder: '名前を入力してください（例：山田太郎）',
    userEmail: 'メールアドレス',
    userEmailPlaceholder: 'your.email@siemens.com',
    userTheme: 'テーマの設定',
    lightTheme: 'ライト',
    darkTheme: 'ダーク',
    autoTheme: '自動（システム）',
    notificationsEnabled: '通知を有効にする',
    notificationsDescription: 'チャットの応答が準備できたときに通知を受け取る',
    saveProfile: 'プロフィールを保存',
    profileSaved: '✓ プロフィールが正常に保存されました！',
    profileSaveError: 'プロフィールの保存に失敗しました。もう一度お試しください。',
    accountStats: 'あなたの統計',
    chatSessions: 'チャットセッション',
    codeGenSessions: 'コード生成',
    questionsAsked: '質問数',
      codeGenerated: '生成されたコード',
      feedbackTitle: 'これは役に立ちましたか？',
  },
  pt: {
    chat: 'Chat', codeGen: 'Geração de código', more: 'Mais', settings: 'Configurações', help: 'Ajuda', migrate: 'Migrar',
    responseLanguageTitle: '🌍 Idioma da resposta',
    responseLanguageDescription: 'A IA responderá no idioma selecionado. Exemplos de código permanecem no idioma original.',
    send: 'Enviar', askPlaceholder: 'Pergunte sobre Siemens iX...', listening: 'Ouvindo…',
    analyticsTitle: 'Análise de uso',
    analyticsDescription: 'Acompanhe perguntas comuns para melhorar a documentação e a orientação do produto. Os dados ficam em memória e são redefinidos ao reiniciar o servidor.',
    loading: 'Carregando…',
    analyticsLoadError: '⚠️ Não foi possível carregar a análise: {error}',
    queriesByFeature: 'Consultas por recurso',
    topQuestions: 'Perguntas principais',
    recentQueries: 'Consultas recentes',
    noQueriesYet: 'Nenhuma consulta rastreada ainda. Use Chat ou Geração de código para gerar dados.',
    feature: 'Recurso',
    queries: 'Consultas',
    settingsApiKey: '🔑 Chave de API',
    providerKeyToManage: 'Chave do provedor a gerenciar',
    providerModelTitle: '🤖 Provedor e modelo de IA',
    providerModelDescription: 'Configure Chat e Code Gen de forma independente. Cada um pode usar um provedor e modelo diferentes.',
    freeVsAi: '🆓 Gratuito vs Assistente IA',
    docs: 'Ir para docs', blog: 'Blog', support: 'Suporte', starterApp: 'App inicial',
    migrationTitle: '↔ Assistente de migração',
    migrationDescription: 'Cole código que usa APIs iX obsoletas. O assistente analisa e gera código atualizado com diff linha por linha e resumo de migração.',
    migrationModeApi: 'Migração de API',
    migrationModeUpgrade: 'Atualização de versão',
    migrationUpgradeDescription: 'Atualize código entre versões suportadas do iX. Selecione versões de origem e destino para obter orientação e código transformado.',
    yourExistingCode: 'Seu código atual',
    migrationPlaceholder: 'Cole código que usa componentes ou APIs iX obsoletos…',
    migrationUpgradePlaceholder: 'Cole código para atualizar entre versões do iX…',
    analyzing: 'Analisando…',
    analyzeAndMigrate: 'Analisar e migrar',
    analyzeAndUpgrade: 'Analisar e atualizar',
    summary: 'Resumo:',
    diff: '🔄 Diff (antigo → novo)',
    migratedCode: 'Código migrado',
    fromVersion: 'Da versão',
    toVersion: 'Para versão',
    version: 'Versão',
    versionStatus: 'Status',
    latest: 'Mais recente',
    maintenance: 'Manutenção',
    endOfLife: 'Fim de vida',
    released: 'Lançado',
    maintenanceSince: 'Manutenção desde',
    eolSince: 'Fim de vida desde',
    notApplicable: '-',
    upgradeVersionRequired: 'Selecione as versões de origem e destino.',
    upgradeVersionOrderError: 'A versão de destino deve ser mais recente que a versão de origem.',
    upgradeFromEolWarning: '⚠️ A versão de origem {version} está em fim de vida. A atualização é recomendada o mais rápido possível.',
    upgradePathHint: 'Caminho recomendado para V2.0.0: atualize para V3.0.0 primeiro, depois para V4.0.0.',
    showVersionTable: 'Mostrar tabela de versões',
    hideVersionTable: 'Ocultar tabela de versões',
    copy: 'Copiar',
    voiceInputNotSupported: 'A entrada de voz não é suportada neste navegador.',
    voiceRecognitionError: 'Erro de reconhecimento de voz. Por favor, tente novamente.',
    deprecationHint: '⚠️ API obsoleta detectada: {names}. O bot sugerirá a substituição correta.',
    chatCleared: 'Chat limpo. Pergunte-me qualquer coisa sobre Siemens iX!',
    codeGenerationNeedsKey: '🔑 A geração de código requer um modelo de IA. Adicione sua chave API de IA na aba ⚙️ Configurações para desbloquear este recurso.',
    deprecationWarningCodegen: '⚠️ Alguns componentes correspondentes contêm avisos de depreciação. Revise os comentários do código gerado cuidadosamente e verifique o guia de migração.',
    noCodeGenerated: 'Nenhum código gerado.',
    somethingWentWrong: 'Algo deu errado',
    couldNotDownloadGenerated: 'Não foi possível baixar o conteúdo gerado.',
    refinementNeedsKey: '🔑 O refinamento de código requer uma chave API — adicione uma em ⚙️ Configurações.',
    refinementFailed: 'Refinamento falhou',
    migrationNeedsKey: '🔑 A análise de migração requer uma chave API — adicione uma em ⚙️ Configurações.',
    migrationFailed: 'Análise de migração falhou',
    migrationRequiresApiKey: '🔑 A migração requer uma chave API. Adicione uma em',
    settingsArrow: '⚙️ Configurações →',
    chatHistory: 'Histórico de chat',
    noSavedChatSessions: 'Nenhuma sessão salva ainda. As sessões de chat são salvas quando você limpa ou inicia uma nova conversa.',
    codeGenHistory: 'Histórico de geração de código',
    noSavedCodegenSessions: 'Nenhuma geração salva ainda. As sessões de código são salvas quando você limpa ou inicia uma nova geração.',
    restore: 'Restaurar',
    delete: 'Excluir',
    you: 'Você',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ Esta resposta menciona APIs obsoletas ou mudanças importantes. Verifique os documentos de migração.',
    sourcesLabel: 'Fontes:',
    thinking: 'Pensando…',
    stopListening: 'Parar de ouvir',
    voiceInput: 'Entrada de voz',
    stopVoiceInput: 'Parar entrada de voz',
    startVoiceInput: 'Iniciar entrada de voz',
    readAloud: 'Ler em voz alta',
    stopReading: 'Parar leitura',
    ttsNotSupported: 'A conversão de texto em fala não é compatível neste navegador.',
    describeYourUi: 'Descreva sua interface',
    describeUiPlaceholder: 'ex.: Criar uma página de login com nome de usuário, senha e botão de login',
    pressCtrlEnter: 'Pressione Ctrl+Enter para gerar',
    tryExample: 'Tentar um exemplo',
    componentPicker: 'Seletor de componentes',
    hide: 'Ocultar',
    browseAndAdd: 'Navegar e adicionar ▾',
    searchComponentsPlaceholder: 'Pesquisar componentes… (ex.: button, modal, input)',
    addComponentToPrompt: 'Adicionar {component} ao prompt',
    framework: 'Framework',
    generating: 'Gerando…',
    generateCode: 'Gerar código',
    componentsUsed: 'Componentes usados ({count})',
    generatedCode: 'Código gerado',
    openInStackblitz: 'Abrir no sandbox ao vivo do StackBlitz',
    regenerateCode: 'Regenerar código',
    regenerate: 'Regenerar',
    downloadCode: 'Baixar código',
    download: 'Baixar',
    copyCode: 'Copiar código',
    copied: 'Copiado!',
    accountTitle: '👤 Sua Conta',
    accountDescription: 'Gerencie seu perfil e preferências do iX AI Assistant.',
    userName: 'Nome de exibição',
    userNamePlaceholder: 'Digite seu nome (ex.: João Silva)',
    userEmail: 'Endereço de e-mail',
    userEmailPlaceholder: 'seu.email@siemens.com',
    userTheme: 'Preferência de tema',
    lightTheme: 'Claro',
    darkTheme: 'Escuro',
    autoTheme: 'Auto (Sistema)',
    notificationsEnabled: 'Ativar notificações',
    notificationsDescription: 'Receba notificações quando as respostas do chat estiverem prontas',
    saveProfile: 'Salvar perfil',
    profileSaved: '✓ Perfil salvo com sucesso!',
    profileSaveError: 'Falha ao salvar o perfil. Por favor, tente novamente.',
    accountStats: 'Suas Estatísticas',
    chatSessions: 'Sessões de chat',
    codeGenSessions: 'Gerações de código',
    questionsAsked: 'Perguntas feitas',
      codeGenerated: 'Código gerado',
      feedbackTitle: 'Isso foi útil?',
    refinePlaceholder: 'Refinar: ex. "tornar o botão secundário" ou "adicionar um estado de carregamento"…',
    refineTitle: 'Refine o código gerado com uma instrução em linguagem natural',
    refine: 'Refinar',
    siemensKeyDescription: 'Disponível para todos os funcionários da Siemens — sem necessidade de cartão de crédito. Gere sua chave em my.siemens.com → My Keys → Create, scope: llm.',
    siemensKeyLink: '↗ Obtenha sua chave API LLM da Siemens (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'Obtenha sua chave API Groq gratuita em console.groq.com. Groq fornece inferência ultrarrápida para modelos de peso aberto.',
    groqKeyLink: '↗ Obtenha sua chave API Groq (console.groq.com → API Keys)',
    keyLoadingLabel: 'Carregando…',
    keyDecrypting: 'Descriptografando…',
    siemensKeySavedEncrypted: '✅ Chave API Siemens (salva e criptografada)',
    enterSiemensApiKey: 'Digite sua chave API Siemens',
    removeKey: 'Remover chave',
    saveKey: 'Salvar chave',
    siemensSavedBadge: '✓ Chave Siemens salva! Recursos de IA desbloqueados.',
    groqKeySavedEncrypted: '✅ Chave API Groq (salva e criptografada)',
    enterGroqApiKey: 'Digite sua chave API Groq',
    groqSavedBadge: '✓ Chave Groq salva! Recursos de IA desbloqueados.',
    provider: 'Provedor',
    model: 'Modelo',
    keySavedSuffix: ' ✓ chave salva',
    addKeyFirstSuffix: ' (adicione uma chave primeiro)',
    free: 'Gratuito',
    withKey: 'Com chave',
    ixFaqAnswers: 'Respostas FAQ iX',
    componentLookup: 'Pesquisa de componentes',
    chatAnswers: 'Respostas do chat',
    docsOnly: 'Apenas docs',
    aiLlm: 'IA (LLM)',
    codeGeneration: 'Geração de código',
    modelSelection: 'Seleção de modelo',
    keysEncryptedPrefix: '🔒 Suas chaves estão',
    keysEncryptedCore: 'criptografadas com AES-256-GCM',
    keysEncryptedSuffix: 'antes de serem salvas no localStorage — nunca armazenadas como texto simples. As chaves são enviadas apenas ao endpoint de API do provedor escolhido.',
    changeProviderModel: 'Alterar provedor e modelo',
    addKeyInSettingsSuffix: ' (adicionar chave nas Configurações)',
  },
  ko: {
    chat: '채팅', codeGen: '코드 생성', more: '더보기', settings: '설정', help: '도움말', migrate: '마이그레이션',
    responseLanguageTitle: '🌍 응답 언어',
    responseLanguageDescription: 'AI는 선택한 언어로 응답합니다. 코드 예시는 원래 언어를 유지합니다.',
    send: '보내기', askPlaceholder: 'Siemens iX에 대해 질문하세요...', listening: '듣는 중…',
    analyticsTitle: '사용 분석',
    analyticsDescription: '자주 묻는 질문을 추적하여 문서와 제품 가이드를 개선하세요. 데이터는 메모리에 저장되며 서버 재시작 시 초기화됩니다.',
    loading: '로딩 중…',
    analyticsLoadError: '⚠️ 분석을 불러올 수 없습니다: {error}',
    queriesByFeature: '기능별 질의',
    topQuestions: '상위 질문',
    recentQueries: '최근 질문',
    noQueriesYet: '아직 추적된 질의가 없습니다. 채팅 또는 코드 생성을 사용해 데이터를 만들어 보세요.',
    feature: '기능',
    queries: '질의',
    settingsApiKey: '🔑 API 키',
    providerKeyToManage: '관리할 제공자 키',
    providerModelTitle: '🤖 AI 제공자 및 모델',
    providerModelDescription: '채팅과 코드 생성을 독립적으로 구성합니다. 각각 다른 제공자와 모델을 사용할 수 있습니다.',
    freeVsAi: '🆓 무료 vs AI 어시스턴트',
    docs: '문서로 이동', blog: '블로그', support: '지원', starterApp: '스타터 앱',
    migrationTitle: '↔ 사용 중단 마이그레이션 마법사',
    migrationDescription: '더 이상 사용되지 않는 iX API를 사용하는 코드를 붙여넣으세요. 마법사가 분석하고 줄별 차이와 명확한 마이그레이션 요약과 함께 업그레이드된 코드를 출력합니다.',
    migrationModeApi: 'API 마이그레이션',
    migrationModeUpgrade: '버전 업그레이드',
    migrationUpgradeDescription: '지원되는 iX 버전 간에 코드를 업그레이드합니다. 소스 및 대상 버전을 선택하여 가이드 및 변환된 코드를 받으세요.',
    yourExistingCode: '기존 코드',
    migrationPlaceholder: '더 이상 사용되지 않는 iX 컴포넌트 또는 API를 사용하는 코드 붙여넣기…',
    migrationUpgradePlaceholder: 'iX 버전 간에 업그레이드할 코드 붙여넣기…',
    analyzing: '분석 중…',
    analyzeAndMigrate: '분석 및 마이그레이션',
    analyzeAndUpgrade: '분석 및 업그레이드',
    summary: '요약:',
    diff: '🔄 차이점 (이전 → 새로운)',
    migratedCode: '마이그레이션된 코드',
    fromVersion: '소스 버전',
    toVersion: '대상 버전',
    version: '버전',
    versionStatus: '상태',
    latest: '최신',
    maintenance: '유지 관리',
    endOfLife: '지원 종료',
    released: '출시',
    maintenanceSince: '유지 관리 시작',
    eolSince: '지원 종료 일자',
    notApplicable: '-',
    upgradeVersionRequired: '소스 및 대상 버전을 모두 선택하세요.',
    upgradeVersionOrderError: '대상 버전은 소스 버전보다 최신이어야 합니다.',
    upgradeFromEolWarning: '⚠️ 소스 버전 {version}은 지원이 종료되었습니다. 가능한 한 빨리 업그레이드하는 것이 좋습니다.',
    upgradePathHint: 'V2.0.0의 권장 경로: 먼저 V3.0.0으로 업그레이드한 다음 V4.0.0으로 업그레이드하세요.',
    showVersionTable: '버전 표 표시',
    hideVersionTable: '버전 표 숨기기',
    copy: '복사',
    voiceInputNotSupported: '이 브라우저에서는 음성 입력이 지원되지 않습니다.',
    voiceRecognitionError: '음성 인식 오류입니다. 다시 시도해 주세요.',
    deprecationHint: '⚠️ 더 이상 사용되지 않는 API 발견: {names}. 봇이 올바른 대체를 제안합니다.',
    chatCleared: '채팅이 지워졌습니다. Siemens iX에 대해 무엇이든 물어보세요!',
    codeGenerationNeedsKey: '🔑 코드 생성에는 AI 모델이 필요합니다. ⚙️ 설정 탭에 AI API 키를 추가하여 이 기능을 잠금 해제하세요.',
    deprecationWarningCodegen: '⚠️ 일부 일치하는 컴포넌트에 사용 중단 알림이 포함되어 있습니다. 생성된 코드 주석을 주의 깊게 검토하고 마이그레이션 가이드를 확인하세요.',
    noCodeGenerated: '코드가 생성되지 않았습니다.',
    somethingWentWrong: '문제가 발생했습니다',
    couldNotDownloadGenerated: '생성된 콘텐츠를 다운로드할 수 없습니다.',
    refinementNeedsKey: '🔑 코드 개선에는 API 키가 필요합니다——⚙️ 설정에서 추가하세요.',
    refinementFailed: '개선에 실패했습니다',
    migrationNeedsKey: '🔑 마이그레이션 분석에는 API 키가 필요합니다——⚙️ 설정에서 추가하세요.',
    migrationFailed: '마이그레이션 분석에 실패했습니다',
    migrationRequiresApiKey: '🔑 마이그레이션에는 API 키가 필요합니다. 다음에 추가하세요',
    settingsArrow: '⚙️ 설정 →',
    chatHistory: '채팅 기록',
    noSavedChatSessions: '아직 저장된 세션이 없습니다. 채팅 세션은 지우거나 새 대화를 시작할 때 저장됩니다.',
    codeGenHistory: '코드 생성 기록',
    noSavedCodegenSessions: '아직 저장된 생성이 없습니다. 코드 세션은 지우거나 새 생성을 시작할 때 저장됩니다.',
    restore: '복구',
    delete: '삭제',
    you: '당신',
    ixBot: 'iX Bot',
    ixBotPremium: 'iX Bot ✨',
    responseHasDeprecationWarning: '⚠️ 이 응답은 더 이상 사용되지 않는 API 또는 중대한 변경 사항을 언급합니다. 마이그레이션 문서를 확인하세요.',
    sourcesLabel: '출처:',
    thinking: '생각 중…',
    stopListening: '듣기 중지',
    voiceInput: '음성 입력',
    stopVoiceInput: '음성 입력 중지',
    startVoiceInput: '음성 입력 시작',
    readAloud: '읽어주기',
    stopReading: '읽기 중지',
    ttsNotSupported: '이 브라우저에서는 텍스트 음성 변환을 지원하지 않습니다.',
    describeYourUi: 'UI 설명',
    describeUiPlaceholder: '예: 사용자 이름, 비밀번호 및 로그인 버튼이 있는 로그인 페이지 만들기',
    pressCtrlEnter: 'Ctrl+Enter를 눌러 생성',
    tryExample: '예제 시도',
    componentPicker: '컴포넌트 선택기',
    hide: '숨기기',
    browseAndAdd: '탐색 및 추가 ▾',
    searchComponentsPlaceholder: '컴포넌트 검색… (예: button, modal, input)',
    addComponentToPrompt: '{component}을(를) 프롬프트에 추가',
    framework: '프레임워크',
    generating: '생성 중…',
    generateCode: '코드 생성',
    componentsUsed: '사용된 컴포넌트 ({count})',
    generatedCode: '생성된 코드',
    openInStackblitz: 'StackBlitz 라이브 샌드박스에서 열기',
    regenerateCode: '코드 재생성',
    regenerate: '재생성',
    downloadCode: '코드 다운로드',
    download: '다운로드',
    copyCode: '코드 복사',
    copied: '복사됨!',
    refinePlaceholder: '개선: 예. "버튼을 보조로 변경" 또는 "로딩 상태 추가"…',
    refineTitle: '자연어 명령으로 생성된 코드 개선',
    refine: '개선',
    siemensKeyDescription: '모든 Siemens 직원이 사용 가능——신용카드 불필요. my.siemens.com → My Keys → Create에서 키를 생성하세요, scope: llm.',
    siemensKeyLink: '↗ Siemens LLM API 키 받기 (my.siemens.com → My Keys → Create, scope: llm)',
    groqKeyDescription: 'console.groq.com에서 무료 Groq API 키를 받으세요. Groq는 오픈 가중치 모델에 대해 초고속 추론을 제공합니다.',
    groqKeyLink: '↗ Groq API 키 받기 (console.groq.com → API Keys)',
    keyLoadingLabel: '로딩 중…',
    keyDecrypting: '복호화 중…',
    siemensKeySavedEncrypted: '✅ Siemens API 키 (저장 및 암호화됨)',
    enterSiemensApiKey: 'Siemens API 키를 입력하세요',
    removeKey: '키 제거',
    saveKey: '키 저장',
    siemensSavedBadge: '✓ Siemens 키 저장됨! AI 기능이 잔금해제되었습니다.',
    groqKeySavedEncrypted: '✅ Groq API 키 (저장 및 암호화됨)',
    enterGroqApiKey: 'Groq API 키를 입력하세요',
    groqSavedBadge: '✓ Groq 키 저장됨! AI 기능이 잠금해제되었습니다.',
    provider: '제공자',
    model: '모델',
    keySavedSuffix: ' ✓ 키 저장됨',
    addKeyFirstSuffix: ' (먼저 키 추가)',
    free: '무료',
    withKey: '키 사용',
    ixFaqAnswers: 'iX FAQ 답변',
    componentLookup: '컴포넌트 검색',
    chatAnswers: '채팅 답변',
    docsOnly: '문서만',
    aiLlm: 'AI (LLM)',
    codeGeneration: '코드 생성',
    modelSelection: '모델 선택',
    keysEncryptedPrefix: '🔒 키는',
    keysEncryptedCore: 'AES-256-GCM으로 암호화',
    keysEncryptedSuffix: 'localStorage에 저장되기 전에——일반 텍스트로 저장되지 않습니다. 키는 선택한 제공자의 API 엔드포인트로만 전송됩니다.',
    changeProviderModel: '제공자 및 모델 변경',
    addKeyInSettingsSuffix: ' (설정에서 키 추가)',
    accountTitle: '👤 내 계정',
    accountDescription: 'iX AI Assistant 프로필 및 기본 설정을 관리합니다.',
    userName: '표시 이름',
    userNamePlaceholder: '이름을 입력하세요 (예: 홍길동)',
    userEmail: '이메일 주소',
    userEmailPlaceholder: 'your.email@siemens.com',
    userTheme: '테마 설정',
    lightTheme: '라이트',
    darkTheme: '다크',
    autoTheme: '자동 (시스템)',
    notificationsEnabled: '알림 활성화',
    notificationsDescription: '채팅 응답이 준비되면 알림 받기',
    saveProfile: '프로필 저장',
    profileSaved: '✓ 프로필이 성공적으로 저장되었습니다!',
    profileSaveError: '프로필 저장에 실패했습니다. 다시 시도해 주세요.',
    accountStats: '내 통계',
    chatSessions: '채팅 세션',
    codeGenSessions: '코드 생성',
    questionsAsked: '질문한 횟수',
      codeGenerated: '생성된 코드',
      feedbackTitle: '도움이 되었나요?',
  },
};

function uiText(lang: Language, key: string, vars: Record<string, string | number> = {}) {
  const template = UI_TEXT[lang]?.[key] || UI_TEXT.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? `{${token}}`));
}

function getSpeechLocale(lang: Language): string {
  return lang === 'zh' ? 'zh-CN' :
         lang === 'ja' ? 'ja-JP' :
         lang === 'ko' ? 'ko-KR' :
         lang === 'de' ? 'de-DE' :
         lang === 'fr' ? 'fr-FR' :
         lang === 'es' ? 'es-ES' :
         lang === 'pt' ? 'pt-PT' : 'en-US';
}

// ── Deprecated iX component registry (for proactive hints) ──────────────
const DEPRECATED_PATTERNS = [
  'ix-datetime-picker', 'IxDatetimePicker',
  'ix-time-picker', 'IxTimePicker',
  'ix-date-picker', 'IxDatePicker',
  'ix-input-group', 'IxInputGroup',
  'ix-breadcrumb-next', 'IxBreadcrumbNext',
];

// ── IX Component registry (for Visual Component Picker) ───────────────────
const IX_COMPONENTS = [
  'ix-application', 'ix-application-header', 'ix-menu', 'ix-menu-item',
  'ix-menu-category', 'ix-menu-settings', 'ix-menu-about', 'ix-menu-about-item',
  'ix-menu-about-news', 'ix-menu-avatar', 'ix-menu-avatar-item', 'ix-menu-settings-item',
  'ix-avatar', 'ix-icon', 'ix-icon-button', 'ix-icon-toggle-button',
  'ix-content', 'ix-content-header', 'ix-button', 'ix-link-button',
  'ix-toggle-button', 'ix-split-button', 'ix-dropdown-button', 'ix-dropdown',
  'ix-dropdown-item', 'ix-dropdown-header', 'ix-dropdown-quick-actions',
  'ix-input', 'ix-number-input', 'ix-date-input', 'ix-time-input',
  'ix-textarea', 'ix-select', 'ix-select-item', 'ix-checkbox', 'ix-checkbox-group',
  'ix-radio', 'ix-radio-group', 'ix-toggle', 'ix-slider',
  'ix-date-picker', 'ix-time-picker', 'ix-datetime-picker', 'ix-date-dropdown',
  'ix-card', 'ix-card-content', 'ix-card-list', 'ix-push-card', 'ix-action-card',
  'ix-blind', 'ix-chip', 'ix-pill', 'ix-spinner', 'ix-divider', 'ix-typography',
  'ix-breadcrumb', 'ix-breadcrumb-item', 'ix-pagination',
  'ix-tabs', 'ix-tab-item', 'ix-category-filter', 'ix-expanding-search',
  'ix-event-list', 'ix-event-list-item', 'ix-key-value', 'ix-key-value-list',
  'ix-kpi', 'ix-tile', 'ix-flip-tile', 'ix-flip-tile-content',
  'ix-group', 'ix-group-item', 'ix-tree', 'ix-empty-state',
  'ix-modal-header', 'ix-modal-content', 'ix-modal-footer',
  'ix-pane', 'ix-pane-layout', 'ix-drawer',
  'ix-message-bar', 'ix-toast-container', 'ix-tooltip',
  'ix-progress-indicator', 'ix-layout-auto', 'ix-layout-grid', 'ix-row', 'ix-col',
  'ix-field-label', 'ix-custom-field', 'ix-upload',
  'ix-workflow-steps', 'ix-workflow-step',
];

// ── Web Crypto: AES-GCM encryption for localStorage ────────────────────────
// Key is derived via PBKDF2 from a fixed app passphrase.
// This prevents the raw API key from sitting as plain text in localStorage.
async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('ix-ai-assistant-v1'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('ix-api-salt-2026'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(plain: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  );
  // Prepend IV to ciphertext, then base64-encode the whole thing
  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 12);
  return btoa(String.fromCharCode(...Array.from(combined)));
}

async function decryptApiKey(stored: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}

type Mode = 'chat' | 'codegen' | 'account' | 'settings' | 'migrate' | 'help' | 'analytics';
type Framework = 'react' | 'angular' | 'angular-standalone' | 'vue' | 'webcomponents';
type MigrationFlow = 'api' | 'upgrade';

type IxVersionStatus = 'latest' | 'maintenance' | 'eol';

interface IxVersionInfo {
  id: string;
  status: IxVersionStatus;
  released: string;
  maintenanceSince: string;
  eolSince: string;
}

const IX_VERSIONS: IxVersionInfo[] = [
  {
    id: 'V4.0.0',
    status: 'latest',
    released: 'November 2025',
    maintenanceSince: '-',
    eolSince: '-',
  },
  {
    id: 'V3.0.0',
    status: 'maintenance',
    released: 'May 2025',
    maintenanceSince: 'November 2025',
    eolSince: '-',
  },
  {
    id: 'V2.0.0',
    status: 'eol',
    released: 'September 2023',
    maintenanceSince: 'May 2025',
    eolSince: 'November 2025',
  },
];

const IX_VERSION_ORDER: Record<string, number> = {
  'V2.0.0': 2,
  'V3.0.0': 3,
  'V4.0.0': 4,
};

interface Source {
  title: string;
  url: string;
  deprecated?: boolean;
}

type FeedbackRating = 'up' | 'down';
type FeedbackScope = 'chat' | 'codegen' | 'migrate';

interface FeedbackState {
  rating: FeedbackRating | null;
  correction: string;
  submitted: boolean;
  submitting: boolean;
  error: string;
  showCorrection: boolean;
}

const createFeedbackState = (): FeedbackState => ({
  rating: null,
  correction: '',
  submitted: false,
  submitting: false,
  error: '',
  showCorrection: false,
});

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  tier?: 'free' | 'premium';
  sources?: Source[];
  hasDeprecationWarnings?: boolean;
  feedbackEligible?: boolean;
  feedback?: FeedbackState;
}

const isChatMessageFeedbackEligible = (message: ChatMessage): boolean =>
  message.role === 'bot' && (message.feedbackEligible === true || (!!message.feedback && message.feedbackEligible !== false));

interface MatchedComponent {
  title: string;
  score: number;
  url?: string;
  deprecated?: boolean;
  matchedKeywords: string[];
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

interface CodeGenSession {
  id: string;
  title: string;
  timestamp: number;
  description: string;
  framework: Framework;
  code: string;
  matchedComponents: MatchedComponent[];
}

interface UserProfile {
  name: string;
  email: string;
  theme: 'light' | 'dark' | 'auto';
  notificationsEnabled: boolean;
  createdAt: number;
  lastUpdated: number;
}

const FRAMEWORK_LABELS: Record<Framework, string> = {
  react: 'React',
  angular: 'Angular',
  'angular-standalone': 'Angular SA',
  vue: 'Vue',
  webcomponents: 'Web Components',
};

const EXAMPLE_PROMPTS = [
  'Create a login page with username input, password input, login button, and remember me checkbox',
  'Build a dashboard with a content header, two KPI cards, and a line chart',
  'Create a settings page with a form containing toggle switches, a select dropdown, and save/cancel buttons',
  'Build a data table page with pagination, a search bar, and action buttons for add/edit/delete',
  'Show me how to migrate from a deprecated component to its replacement',
  'Build a notification center using messagebar with dismiss and action buttons',
];

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT_VH = 84; // percent of viewport height
const PANEL_BOTTOM_PX = 92; // must match CSS .panel { bottom }
const PANEL_RIGHT_PX = 24; // must match CSS .panel { right }
const VIEWPORT_PADDING = 8; // breathing room from edges
const PANEL_TOP_RESERVED_PX = 70; // keep header area free

function getPanelMaxHeightPx(): number {
  if (typeof window === 'undefined') return 600;
  const vpH = document.documentElement.clientHeight;
  return Math.max(200, vpH - PANEL_BOTTOM_PX - PANEL_TOP_RESERVED_PX);
}

function stripCodeFence(code: string): string {
  return code
    .replace(/^```[\w-]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

function getDownloadFileName(framework: Framework): string {
  return `ix-${framework}-generated.txt`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── History helpers ─────────────────────────────────────────────────
function loadChatHistory(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(sessions: ChatSession[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_STORAGE, JSON.stringify(sessions.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

function loadCodeGenHistory(): CodeGenSession[] {
  try {
    const raw = localStorage.getItem(CODEGEN_HISTORY_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCodeGenHistory(sessions: CodeGenSession[]) {
  try {
    localStorage.setItem(CODEGEN_HISTORY_STORAGE, JSON.stringify(sessions.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function deriveSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Empty session';
  return firstUser.text.length > 50 ? firstUser.text.slice(0, 50) + '…' : firstUser.text;
}

// ────────────────────────────────────────────────────────────────────────────
// Usage Analytics View
// Fetches live data from GET /analytics and renders top questions + counts.
// ────────────────────────────────────────────────────────────────────────────
function AnalyticsView({ lang }: { lang: Language }) {
  const [data, setData] = useState<{
    endpointCounts: Record<string, number>;
    totalTracked: number;
    topQueries: { text: string; count: number }[];
    recentQueries: { text: string; timestamp: number; endpoint: string; lang: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/analytics')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const featureLabel = (endpoint: string) => {
    const endpointToKey: Record<string, string> = {
      chat: 'chat',
      codegen: 'codeGen',
      account: 'account',
      settings: 'settings',
      help: 'help',
      migrate: 'migrate',
    };
    const key = endpointToKey[endpoint];
    return key ? uiText(lang, key) : endpoint;
  };

  return (
    <div className={styles.settingsBody}>
      <div className={styles.settingsSection}>
        <h3 className={styles.settingsTitle}>{uiText(lang, 'analyticsTitle')}</h3>
        <p className={styles.settingsDescription}>
          {uiText(lang, 'analyticsDescription')}
        </p>
      </div>

      {loading && <div className={styles.settingsDescription} style={{ padding: '0 16px' }}>{uiText(lang, 'loading')}</div>}
      {error && <div className={styles.error} style={{ margin: '0 16px' }}>{uiText(lang, 'analyticsLoadError', { error })}</div>}

      {data && (
        <>
          {/* Endpoint counts */}
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsTitle}>{uiText(lang, 'queriesByFeature')}</h3>
            <table className={styles.tierTable}>
              <thead><tr><th>{uiText(lang, 'feature')}</th><th>{uiText(lang, 'queries')}</th></tr></thead>
              <tbody>
                {Object.entries(data.endpointCounts)
                  .filter(([k]) => k !== 'refine')
                  .map(([k, v]) => (
                    <tr key={k}><td>{featureLabel(k)}</td><td>{v}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Top questions */}
          {data.topQueries.length > 0 && (
            <div className={styles.settingsSection}>
              <h3 className={styles.settingsTitle}>{uiText(lang, 'topQuestions')}</h3>
              <div className={styles.analyticsQueryList}>
                {data.topQueries.map((q, i) => (
                  <div key={i} className={styles.analyticsQueryItem}>
                    <span className={styles.analyticsQueryText}>{q.text}</span>
                    <span className={styles.analyticsQueryCount}>×{q.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent queries */}
          {data.recentQueries.length > 0 && (
            <div className={styles.settingsSection}>
              <h3 className={styles.settingsTitle}>{uiText(lang, 'recentQueries')}</h3>
              <div className={styles.analyticsQueryList}>
                {data.recentQueries.map((q, i) => (
                  <div key={i} className={styles.analyticsQueryItem}>
                    <span className={styles.analyticsQueryText}>{q.text}</span>
                    <span className={styles.analyticsQueryMeta}>
                      {q.endpoint} · {q.lang} · {new Date(q.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.topQueries.length === 0 && data.recentQueries.length === 0 && (
            <div className={styles.settingsDescription} style={{ padding: '0 16px 16px' }}>
              {uiText(lang, 'noQueriesYet')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');

  // ── Resize state ──
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  // Lazy init: compute once at mount so window is defined (avoids SSR crash)
  const initialHeightRef = useRef<number | null>(null);
  if (initialHeightRef.current === null) {
    initialHeightRef.current =
      typeof window !== 'undefined'
        ? Math.min(
            Math.round(window.innerHeight * (DEFAULT_HEIGHT_VH / 100)),
            getPanelMaxHeightPx()
          )
        : 600;
  }
  const [panelHeight, setPanelHeight] = useState(initialHeightRef.current);

  // Initial dimensions are the minimum – users can only resize larger
  const MIN_WIDTH = DEFAULT_WIDTH;
  const MIN_HEIGHT = initialHeightRef.current;
  const resizing = useRef<{
    active: boolean;
    edge: 'corner' | 'top' | 'left';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── API Key state ──
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true); // true while decrypting on mount

  // ── Groq API Key state ──
  const [groqApiKey, setGroqApiKey] = useState<string>('');
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeySaved, setGroqKeySaved] = useState(false);
  const [groqKeyLoading, setGroqKeyLoading] = useState(true);

  // ── Provider & model state ──
  const [chatProvider, setChatProvider] = useState<Provider>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(CHAT_PROVIDER_STORAGE) as Provider) || 'siemens';
    }
    return 'siemens';
  });
  const [codegenProvider, setCodegenProvider] = useState<Provider>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(CODEGEN_PROVIDER_STORAGE) as Provider) || 'siemens';
    }
    return 'siemens';
  });
  const [chatModel, setChatModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(CHAT_MODEL_STORAGE) || CHAT_PROVIDER_DEFAULT_MODEL.siemens;
    }
    return CHAT_PROVIDER_DEFAULT_MODEL.siemens;
  });
  const [codegenModel, setCodegenModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(CODEGEN_MODEL_STORAGE) || CODEGEN_PROVIDER_DEFAULT_MODEL.siemens;
    }
    return CODEGEN_PROVIDER_DEFAULT_MODEL.siemens;
  });

  const resolveModelForProvider = (
    targetProvider: Provider,
    model: string,
    target: 'chat' | 'codegen' = 'chat'
  ) => {
    const fallback =
      target === 'codegen'
        ? CODEGEN_PROVIDER_DEFAULT_MODEL[targetProvider]
        : CHAT_PROVIDER_DEFAULT_MODEL[targetProvider];
    return PROVIDER_MODELS[targetProvider].some((m) => m.id === model)
      ? model
      : fallback;
  };

  const hasSiemensKey = apiKey.trim().length > 0;
  const hasGroqKey = groqApiKey.trim().length > 0;
  const providerHasKey = (provider: Provider) =>
    provider === 'siemens' ? hasSiemensKey : hasGroqKey;

  const switchChatProvider = (nextProvider: Provider) => {
    if (!providerHasKey(nextProvider)) return;
    setChatProvider(nextProvider);
    setChatModel((prev) => resolveModelForProvider(nextProvider, prev, 'chat'));
  };

  const switchCodegenProvider = (nextProvider: Provider) => {
    if (!providerHasKey(nextProvider)) return;
    setCodegenProvider(nextProvider);
    setCodegenModel((prev) => resolveModelForProvider(nextProvider, prev, 'codegen'));
  };

  // Keep models valid for the currently selected provider (also covers restored localStorage values)
  useEffect(() => {
    const resolved = resolveModelForProvider(chatProvider, chatModel, 'chat');
    if (resolved !== chatModel) setChatModel(resolved);
  }, [chatProvider, chatModel]);

  useEffect(() => {
    const resolved = resolveModelForProvider(codegenProvider, codegenModel, 'codegen');
    if (resolved !== codegenModel) setCodegenModel(resolved);
  }, [codegenProvider, codegenModel]);

  const effectiveChatModel = resolveModelForProvider(chatProvider, chatModel, 'chat');
  const effectiveCodegenModel = resolveModelForProvider(codegenProvider, codegenModel, 'codegen');

  // Active keys by mode/provider
  const chatActiveKey = chatProvider === 'siemens' ? apiKey : groqApiKey;
  const codegenActiveKey = codegenProvider === 'siemens' ? apiKey : groqApiKey;
  const hasChatPremium = providerHasKey(chatProvider);
  const hasCodegenPremium = providerHasKey(codegenProvider);
  const hasPremium = hasChatPremium || hasCodegenPremium;
  const chatRequestProvider = hasChatPremium ? chatProvider : undefined;
  const chatRequestModel = hasChatPremium ? effectiveChatModel : undefined;
  const chatRequestApiKey = hasChatPremium ? chatActiveKey : '';

  // ── History state ──
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [codeGenHistory, setCodeGenHistory] = useState<CodeGenSession[]>([]);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showCodeGenHistory, setShowCodeGenHistory] = useState(false);

  // ── User Account state ──
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(USER_PROFILE_STORAGE);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  const [userFormInput, setUserFormInput] = useState<Partial<UserProfile>>({});
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // ── Active session ID refs (prevent duplicates when saving) ──
  const activeChatSessionIdRef = useRef<string | null>(null);
  const activeCodeGenSessionIdRef = useRef<string | null>(null);

  // ── Load history on mount ──
  useEffect(() => {
    setChatHistory(loadChatHistory());
    setCodeGenHistory(loadCodeGenHistory());
    // Initialize user form input
    if (userProfile) {
      setUserFormInput(userProfile);
    }
  }, []);

  // ── Decrypt stored keys on mount ──
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(API_KEY_STORAGE);
        if (stored) {
          const plain = await decryptApiKey(stored);
          setApiKey(plain);
        }
      } catch {
        localStorage.removeItem(API_KEY_STORAGE);
      } finally {
        setKeyLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(GROQ_KEY_STORAGE);
        if (stored) {
          const plain = await decryptApiKey(stored);
          setGroqApiKey(plain);
        }
      } catch {
        localStorage.removeItem(GROQ_KEY_STORAGE);
      } finally {
        setGroqKeyLoading(false);
      }
    })();
  }, []);

  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: '👋 Hello! Ask me anything about the Siemens iX design system — components, installation, theming, guidelines, migration and more.\n\n⚠️ I can also warn you about deprecated APIs and suggest the correct replacements.',
      feedbackEligible: false,
    },
  ]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // ── Code Generator state ──
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<Framework>('react');
  const [generatedCode, setGeneratedCode] = useState('');
  const [matchedComponents, setMatchedComponents] = useState<MatchedComponent[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Conversational Refine state ──
  const [refineInput, setRefineInput] = useState('');
  const [refineLoading, setRefineLoading] = useState(false);
  const [codegenFeedback, setCodegenFeedback] = useState<FeedbackState>(createFeedbackState());

  // ── Image-to-Code state ──
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Code File Upload state ──
  const [codeFileContent, setCodeFileContent] = useState<string | null>(null);
  const [codeFileName, setCodeFileName] = useState('');
  const codeFileInputRef = useRef<HTMLInputElement>(null);

  // ── Visual Component Picker state ──
  const [showCompPicker, setShowCompPicker] = useState(false);
  const [compSearch, setCompSearch] = useState('');

  // ── Migration Wizard state ──
  const [migrateApiInput, setMigrateApiInput] = useState('');
  const [migrateUpgradeInput, setMigrateUpgradeInput] = useState('');
  const [migrateApiSourceInput, setMigrateApiSourceInput] = useState('');
  const [migrateUpgradeSourceInput, setMigrateUpgradeSourceInput] = useState('');
  const [migrateApiOutput, setMigrateApiOutput] = useState('');
  const [migrateUpgradeOutput, setMigrateUpgradeOutput] = useState('');
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateApiError, setMigrateApiError] = useState('');
  const [migrateUpgradeError, setMigrateUpgradeError] = useState('');
  const [migrateApiSummary, setMigrateApiSummary] = useState('');
  const [migrateUpgradeSummary, setMigrateUpgradeSummary] = useState('');
  const [migrateApiFeedback, setMigrateApiFeedback] = useState<FeedbackState>(createFeedbackState());
  const [migrateUpgradeFeedback, setMigrateUpgradeFeedback] = useState<FeedbackState>(createFeedbackState());
  const [migrationFlow, setMigrationFlow] = useState<MigrationFlow>('api');
  const [upgradeFromVersion, setUpgradeFromVersion] = useState('V3.0.0');
  const [upgradeToVersion, setUpgradeToVersion] = useState('V4.0.0');
  const [showVersionTable, setShowVersionTable] = useState(false);
  const activeMigrateInput = migrationFlow === 'upgrade' ? migrateUpgradeInput : migrateApiInput;
  const activeMigrateSourceInput = migrationFlow === 'upgrade' ? migrateUpgradeSourceInput : migrateApiSourceInput;
  const activeMigrateOutput = migrationFlow === 'upgrade' ? migrateUpgradeOutput : migrateApiOutput;
  const activeMigrateError = migrationFlow === 'upgrade' ? migrateUpgradeError : migrateApiError;
  const activeMigrateSummary = migrationFlow === 'upgrade' ? migrateUpgradeSummary : migrateApiSummary;
  const activeMigrateFeedback = migrationFlow === 'upgrade' ? migrateUpgradeFeedback : migrateApiFeedback;
  const setActiveMigrateInput = (value: string) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeInput(value);
      return;
    }
    setMigrateApiInput(value);
  };
  const setActiveMigrateSourceInput = (value: string) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeSourceInput(value);
      return;
    }
    setMigrateApiSourceInput(value);
  };
  const setActiveMigrateOutput = (value: string) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeOutput(value);
      return;
    }
    setMigrateApiOutput(value);
  };
  const setActiveMigrateError = (value: string) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeError(value);
      return;
    }
    setMigrateApiError(value);
  };
  const setActiveMigrateSummary = (value: string) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeSummary(value);
      return;
    }
    setMigrateApiSummary(value);
  };
  const setActiveMigrateFeedback = (value: FeedbackState | ((prev: FeedbackState) => FeedbackState)) => {
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeFeedback(value);
      return;
    }
    setMigrateApiFeedback(value);
  };

  // ── AbortController refs for in-flight requests ──
  const chatAbortRef = useRef<AbortController | null>(null);
  const codegenAbortRef = useRef<AbortController | null>(null);
  const migrateAbortRef = useRef<AbortController | null>(null);

  // ── Language state ──
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(LANG_STORAGE) as Language) || 'en';
    }
    return 'en';
  });
  const ui = (key: string, vars?: Record<string, string | number>) => uiText(lang, key, vars);

  // ── Settings API key target selector ──
  const [settingsKeyProvider, setSettingsKeyProvider] = useState<Provider>('siemens');

  // ── Voice input state ──
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── Voice output state ──
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const speakingRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ── Proactive deprecation hint state ──
  const [deprecationHint, setDeprecationHint] = useState('');

  // ── More-menu (overflow tabs) state ──
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTierModelMenu, setShowTierModelMenu] = useState(false);

  // ── Persist language preference ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANG_STORAGE, lang);
      // Sync language with backend
      fetch('http://localhost:5000/user/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      }).catch(() => {
        // Silently fail if backend is unavailable
      });
    }
  }, [lang]);

  // ── Persist provider preferences ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHAT_PROVIDER_STORAGE, chatProvider);
      localStorage.setItem(CODEGEN_PROVIDER_STORAGE, codegenProvider);
    }
  }, [chatProvider, codegenProvider]);

  // ── Persist model preferences ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHAT_MODEL_STORAGE, chatModel);
      localStorage.setItem(CODEGEN_MODEL_STORAGE, codegenModel);
    }
  }, [chatModel, codegenModel]);

  // ── Voice input: toggle listening ──
  const toggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setChatError(ui('voiceInputNotSupported'));
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = getSpeechLocale(lang);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      setQuestion(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); setChatError(ui('voiceRecognitionError')); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopSpeaking = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeakingIndex(null);
      speakingRef.current = null;
      return;
    }
    window.speechSynthesis.cancel();
    setSpeakingIndex(null);
    speakingRef.current = null;
  };

  const toggleReadAloud = (text: string, index: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setChatError(ui('ttsNotSupported'));
      return;
    }
    if (!text.trim()) return;
    if (speakingIndex === index) {
      stopSpeaking();
      return;
    }

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLocale(lang);
    utterance.onend = () => {
      if (speakingRef.current === utterance) {
        speakingRef.current = null;
        setSpeakingIndex(null);
      }
    };
    utterance.onerror = () => {
      if (speakingRef.current === utterance) {
        speakingRef.current = null;
        setSpeakingIndex(null);
      }
    };

    speakingRef.current = utterance;
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!isOpen) {
      stopSpeaking();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  // ── Proactive deprecation hint ──
  // Runs when the user pauses typing in the chat input (300 ms debounce).
  useEffect(() => {
    if (!question.trim()) { setDeprecationHint(''); return; }
    const detected = DEPRECATED_PATTERNS.filter((p) =>
      question.toLowerCase().includes(p.toLowerCase())
    );
    if (detected.length === 0) { setDeprecationHint(''); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(DEPRECATION_CHECK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ components: detected, lang }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.alerts?.length > 0) {
            const names = data.alerts.map((a: any) => a.component).join(', ');
            setDeprecationHint(ui('deprecationHint', { names }));
          } else {
            setDeprecationHint('');
          }
        }
      } catch { /* non-blocking */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [question, lang]);

  // ── Resize event handlers ──
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const r = resizing.current;
      if (!r?.active) return;
      e.preventDefault();

      // Use clientWidth/clientHeight (excludes scrollbars) for accurate bounds
      const vpW = document.documentElement.clientWidth;
      const maxW = vpW - PANEL_RIGHT_PX - VIEWPORT_PADDING;
      const maxH = getPanelMaxHeightPx();

      if (r.edge === 'corner' || r.edge === 'left') {
        // Panel is right-anchored, so dragging left increases width
        // Also clamp so left edge doesn't go past VIEWPORT_PADDING
        const newW = Math.min(maxW, Math.max(MIN_WIDTH, r.startW + (r.startX - e.clientX)));
        setPanelWidth(newW);
      }
      if (r.edge === 'corner' || r.edge === 'top') {
        // Panel is bottom-anchored, so dragging up increases height
        const newH = Math.min(maxH, Math.max(MIN_HEIGHT, r.startH + (r.startY - e.clientY)));
        setPanelHeight(newH);
      }
    };

    const onPointerUp = () => {
      if (resizing.current) {
        resizing.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const clampPanelHeight = () => {
      const maxH = getPanelMaxHeightPx();
      setPanelHeight((prev) => Math.min(prev, maxH));
    };

    clampPanelHeight();
    window.addEventListener('resize', clampPanelHeight);
    return () => window.removeEventListener('resize', clampPanelHeight);
  }, [isOpen]);

  const startResize = (
    e: React.PointerEvent,
    edge: 'corner' | 'top' | 'left'
  ) => {
    e.preventDefault();
    resizing.current = {
      active: true,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: panelWidth,
      startH: panelHeight,
    };
    document.body.style.cursor =
      edge === 'corner' ? 'nwse-resize' : edge === 'top' ? 'ns-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Escape key closes panel (or more-menu first) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTierModelMenu) { setShowTierModelMenu(false); }
        else if (showMoreMenu) { setShowMoreMenu(false); }
        else if (isOpen) setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showMoreMenu, showTierModelMenu]);

  // ── Click-outside closes more menu ──
  useEffect(() => {
    if (!showMoreMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-more-menu]')) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showMoreMenu]);

  useEffect(() => {
    if (!showTierModelMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-tier-model-menu]')) setShowTierModelMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showTierModelMenu]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── Focus on open / mode switch ──
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'chat') {
      chatInputRef.current?.focus();
    } else if (mode === 'codegen') {
      textareaRef.current?.focus();
    }
  }, [isOpen, mode]);

  // ════════════════════════════════════════════════════════════
  //  CHAT LOGIC
  // ════════════════════════════════════════════════════════════

  // ── API Key handlers ──
  const saveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    try {
      const encrypted = await encryptApiKey(trimmed);
      localStorage.setItem(API_KEY_STORAGE, encrypted);
    } catch {
      // Fallback: if Web Crypto somehow unavailable, skip storage
    }
    setApiKey(trimmed);
    setApiKeyInput('');
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2500);
  };

  const clearApiKey = () => {
    try { localStorage.removeItem(API_KEY_STORAGE); } catch {}
    setApiKey('');
    setApiKeyInput('');
    // Clear any generated output that relied on the removed key
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeMessage('');
    setCodeError('');
  };

  const saveGroqKey = async () => {
    const trimmed = groqKeyInput.trim();
    if (!trimmed) return;
    try {
      const encrypted = await encryptApiKey(trimmed);
      localStorage.setItem(GROQ_KEY_STORAGE, encrypted);
    } catch {}
    setGroqApiKey(trimmed);
    setGroqKeyInput('');
    setGroqKeySaved(true);
    setTimeout(() => setGroqKeySaved(false), 2500);
  };

  const clearGroqKey = () => {
    try { localStorage.removeItem(GROQ_KEY_STORAGE); } catch {}
    setGroqApiKey('');
    setGroqKeyInput('');
    if (codegenProvider === 'groq') {
      setGeneratedCode('');
      setMatchedComponents([]);
      setCodeMessage('');
      setCodeError('');
    }
  };

  const sendMessage = async () => {
    if (!question.trim() || chatLoading) return;
    const userMsg = question.trim();
    setQuestion('');
    setChatError('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

    // New user message means any restored session is now modified — give it a fresh id on next save
    activeChatSessionIdRef.current = null;
    setChatLoading(true);
    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();
    try {
      // Send conversation history for multi-turn context
      const recentHistory = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: chatAbortRef.current.signal,
        body: JSON.stringify({
          question: userMsg,
          apiKey: chatRequestApiKey,
          history: recentHistory,
          lang,
          ...(chatRequestProvider ? { provider: chatRequestProvider } : {}),
          ...(chatRequestModel ? { model: chatRequestModel } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: data.answer,
          tier: data.tier === 'premium' ? 'premium' : 'free',
          sources: data.sources || [],
          hasDeprecationWarnings: data.hasDeprecationWarnings || false,
          feedbackEligible: true,
          feedback: createFeedbackState(),
        },
      ]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setChatError(err.message || 'Something went wrong');
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  const submitFeedback = async ({
    scope,
    rating,
    correction,
    userInput,
    aiOutput,
    onSuccess,
    onError,
  }: {
    scope: FeedbackScope;
    rating: FeedbackRating;
    correction?: string;
    userInput?: string;
    aiOutput?: string;
    onSuccess: () => void;
    onError: (message: string) => void;
  }) => {
    try {
      const payload = {
        scope,
        rating,
        correction,
        userInput,
        aiOutput,
        lang,
      };

      let lastError: Error | null = null;

      for (const endpoint of FEEDBACK_FALLBACK_URLS) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            onSuccess();
            return;
          }

          const data = await res.json().catch(() => ({}));
          const error = new Error(data.error || `Server error (${res.status})`);

          if (res.status === 404) {
            lastError = error;
            continue;
          }

          throw error;
        } catch (endpointErr: any) {
          lastError = endpointErr instanceof Error ? endpointErr : new Error(String(endpointErr || ui('feedbackSubmitFailed')));
        }
      }

      throw lastError || new Error(ui('feedbackSubmitFailed'));
    } catch (err: any) {
      onError(err?.message || ui('feedbackSubmitFailed'));
    }
  };

  const updateChatFeedback = (index: number, patch: Partial<FeedbackState>) => {
    setChatMessages((prev) =>
      prev.map((msg, i) =>
        i === index && isChatMessageFeedbackEligible(msg)
          ? { ...msg, feedback: { ...createFeedbackState(), ...(msg.feedback || {}), ...patch } }
          : msg
      )
    );
  };

  const handleChatRating = (index: number, rating: FeedbackRating) => {
    const message = chatMessages[index];
    if (!message || !isChatMessageFeedbackEligible(message)) return;
    if (message.feedback?.submitted || message.feedback?.submitting) return;

    if (rating === 'up') {
      updateChatFeedback(index, { submitting: true, error: '', rating: 'up', showCorrection: false });
      const userInput = [...chatMessages.slice(0, index)].reverse().find((m) => m.role === 'user')?.text || '';
      submitFeedback({
        scope: 'chat',
        rating: 'up',
        userInput,
        aiOutput: message.text,
        onSuccess: () => {
          updateChatFeedback(index, { submitting: false, submitted: true, showCorrection: false });
        },
        onError: (message) => {
          updateChatFeedback(index, { submitting: false, error: message });
        },
      });
      return;
    }

    updateChatFeedback(index, {
      rating: 'down',
      showCorrection: true,
      error: '',
    });
  };

  const submitChatCorrection = (index: number) => {
    const msg = chatMessages[index];
    if (!msg || !isChatMessageFeedbackEligible(msg)) return;
    if (msg.feedback?.submitted || msg.feedback?.submitting) return;

    updateChatFeedback(index, { submitting: true, error: '' });
    const userInput = [...chatMessages.slice(0, index)].reverse().find((m) => m.role === 'user')?.text || '';
    submitFeedback({
      scope: 'chat',
      rating: 'down',
      correction: msg.feedback?.correction || '',
      userInput,
      aiOutput: msg.text,
      onSuccess: () => {
        updateChatFeedback(index, { submitting: false, submitted: true, showCorrection: false });
      },
      onError: (message) => {
        updateChatFeedback(index, { submitting: false, error: message });
      },
    });
  };

  // ── Save current chat session to history ──
  const saveChatSession = () => {
    // Only save if there are user messages beyond the welcome message
    const hasUserMessages = chatMessages.some((m) => m.role === 'user');
    if (!hasUserMessages) return;

    const id = activeChatSessionIdRef.current ?? Date.now().toString();
    activeChatSessionIdRef.current = id;

    const session: ChatSession = {
      id,
      title: deriveSessionTitle(chatMessages),
      timestamp: Date.now(),
      messages: chatMessages,
    };
    // Replace existing entry with same id (avoids duplicates on restore/clear cycles)
    const filtered = chatHistory.filter((s) => s.id !== id);
    const updated = [session, ...filtered].slice(0, MAX_HISTORY);
    setChatHistory(updated);
    saveChatHistory(updated);
  };

  const clearChat = () => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatLoading(false);
    saveChatSession();
    activeChatSessionIdRef.current = null; // next session gets a fresh id
    setChatMessages([
      { role: 'bot', text: ui('chatCleared'), feedbackEligible: false },
    ]);
    setChatError('');
  };

  const restoreChatSession = (session: ChatSession) => {
    // Save current before restoring (replaces in-place if already tracked)
    saveChatSession();
    activeChatSessionIdRef.current = session.id;
    setChatMessages(session.messages);
    setShowChatHistory(false);
  };

  const deleteChatSession = (id: string) => {
    const updated = chatHistory.filter((s) => s.id !== id);
    setChatHistory(updated);
    saveChatHistory(updated);
  };

  // ════════════════════════════════════════════════════════════
  //  CODE GENERATOR LOGIC
  // ════════════════════════════════════════════════════════════

  const handleGenerate = async () => {
    if (!description.trim() || codeLoading) return;

    // Gate code generation behind API key
    if (!hasCodegenPremium) {
      setCodeMessage(
        ui('codeGenerationNeedsKey')
      );
      return;
    }

    setCodeError('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeMessage('');
    setCodeLoading(true);
    setCodegenFeedback(createFeedbackState());
    codegenAbortRef.current?.abort();
    codegenAbortRef.current = new AbortController();

    // Auto-save previous generation before starting a new one, then reset so
    // the new generation gets a fresh history id (prevents duplicates)
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = null;

    try {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: codegenAbortRef.current.signal,
        body: JSON.stringify({
          description: description.trim(),
          framework,
          apiKey: codegenActiveKey,
          lang,
          provider: codegenProvider,
          model: effectiveCodegenModel,
          ...(uploadedImage ? { screenshot: uploadedImage } : {}),
          ...(codeFileContent ? { fileContent: codeFileContent, fileName: codeFileName } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.code) {
        setGeneratedCode(data.code);
        setMatchedComponents(data.matchedComponents || []);
        if (data.hasDeprecationWarnings) {
          setCodeMessage(
            ui('deprecationWarningCodegen')
          );
        }
      } else {
        setCodeMessage(data.message || ui('noCodeGenerated'));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setCodeError(err.message || ui('somethingWentWrong'));
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopy = async () => {
    const codeOnly = stripCodeFence(generatedCode);
    try {
      await navigator.clipboard.writeText(codeOnly);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = codeOnly;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!generatedCode.trim()) return;

    setCodeError('');

    try {
      downloadBlob(
        new Blob([generatedCode], { type: 'text/plain;charset=utf-8' }),
        getDownloadFileName(framework)
      );
    } catch (err: any) {
      setCodeError(err?.message || ui('couldNotDownloadGenerated'));
    }
  };

  const handleExampleClick = (prompt: string) => {
    setDescription(prompt);
    textareaRef.current?.focus();
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate();
  };

  // ── Save current code gen session to history ──
  const saveCodeGenSession = () => {
    if (!generatedCode) return;
    const id = activeCodeGenSessionIdRef.current ?? Date.now().toString();
    activeCodeGenSessionIdRef.current = id;
    const session: CodeGenSession = {
      id,
      title: description.length > 50 ? description.slice(0, 50) + '…' : description,
      timestamp: Date.now(),
      description,
      framework,
      code: generatedCode,
      matchedComponents,
    };
    // Replace existing entry with same id (avoids duplicates on restore/clear cycles)
    const filtered = codeGenHistory.filter((s) => s.id !== id);
    const updated = [session, ...filtered].slice(0, MAX_HISTORY);
    setCodeGenHistory(updated);
    saveCodeGenHistory(updated);
  };

  const clearCodeGen = () => {
    codegenAbortRef.current?.abort();
    codegenAbortRef.current = null;
    setCodeLoading(false);
    setRefineLoading(false);
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = null; // next session gets a fresh id
    setDescription('');
    setGeneratedCode('');
    setMatchedComponents([]);
    setCodeError('');
    setCodeMessage('');
    setCodegenFeedback(createFeedbackState());
    setRefineInput('');
    setCodeFileContent(null);
    setCodeFileName('');
    textareaRef.current?.focus();
  };

  const restoreCodeGenSession = (session: CodeGenSession) => {
    // Save current before restoring (replaces in-place if already tracked)
    saveCodeGenSession();
    activeCodeGenSessionIdRef.current = session.id;
    setDescription(session.description);
    setFramework(session.framework);
    setGeneratedCode(session.code);
    setMatchedComponents(session.matchedComponents);
    setCodeError('');
    setCodeMessage('');
    setShowCodeGenHistory(false);
  };

  const deleteCodeGenSession = (id: string) => {
    const updated = codeGenHistory.filter((s) => s.id !== id);
    setCodeGenHistory(updated);
    saveCodeGenHistory(updated);
  };

  // ════════════════════════════════════════════════════════════
  //  USER ACCOUNT MANAGEMENT
  // ════════════════════════════════════════════════════════════

  const saveUserProfile = () => {
    try {
      setProfileSaveStatus('saving');
      const now = Date.now();
      const profile: UserProfile = {
        name: userFormInput.name || '',
        email: userFormInput.email || '',
        theme: userFormInput.theme || 'auto',
        notificationsEnabled: userFormInput.notificationsEnabled ?? true,
        createdAt: userProfile?.createdAt || now,
        lastUpdated: now,
      };
      localStorage.setItem(USER_PROFILE_STORAGE, JSON.stringify(profile));
      setUserProfile(profile);
      setProfileSaveStatus('success');
      setTimeout(() => setProfileSaveStatus('idle'), 2000);
    } catch {
      setProfileSaveStatus('error');
      setTimeout(() => setProfileSaveStatus('idle'), 2000);
    }
  };

  const updateUserFormField = (key: keyof UserProfile, value: any) => {
    setUserFormInput((prev) => ({
      ...prev,
      [key]: value,
    }));
    setProfileSaveStatus('idle');
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 2 — OPEN IN STACKBLITZ
  // ════════════════════════════════════════════════════════════
  const openInStackBlitz = () => {
    const clean = stripCodeFence(generatedCode);
    const fileNames: Record<Framework, string> = {
      react: 'src/App.tsx',
      angular: 'src/app/app.component.ts',
      'angular-standalone': 'src/app/app.component.ts',
      vue: 'src/App.vue',
      webcomponents: 'index.html',
    };
    const templates: Record<Framework, string> = {
      react: 'node',
      angular: 'node',
      'angular-standalone': 'node',
      vue: 'node',
      webcomponents: 'javascript',
    };
    const mainFile = fileNames[framework];
    const form = document.createElement('form');
    form.setAttribute('method', 'POST');
    form.setAttribute('action', `https://stackblitz.com/run?file=${encodeURIComponent(mainFile)}`);
    form.setAttribute('target', '_blank');
    const add = (name: string, value: string) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = name; inp.value = value;
      form.appendChild(inp);
    };
    add('project[title]', 'iX AI Generated App');
    add('project[description]', 'Generated by Siemens iX AI Assistant');
    add('project[template]', templates[framework]);
    add(`project[files][${mainFile}]`, clean);
    if (framework !== 'webcomponents') {
      add('project[files][package.json]', JSON.stringify({
        name: 'ix-ai-generated',
        version: '1.0.0',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { '@siemens/ix': 'latest', '@siemens/ix-icons': 'latest' },
      }, null, 2));
    }
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 1 — CONVERSATIONAL CODE REFINEMENT
  // ════════════════════════════════════════════════════════════
  const handleRefine = async () => {
    if (!refineInput.trim() || refineLoading || !generatedCode) return;
    if (!hasCodegenPremium) {
      setCodeMessage(ui('refinementNeedsKey'));
      return;
    }
    setRefineLoading(true);
    setCodeError('');
    const instruction = refineInput.trim();
    setRefineInput('');
    codegenAbortRef.current?.abort();
    codegenAbortRef.current = new AbortController();
    try {
      const res = await fetch(REFINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: codegenAbortRef.current.signal,
        body: JSON.stringify({ code: generatedCode, instruction, framework, apiKey: codegenActiveKey, lang, provider: codegenProvider, model: effectiveCodegenModel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.code) setGeneratedCode(data.code);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setCodeError(err.message || ui('refinementFailed'));
    } finally {
      setRefineLoading(false);
    }
  };

  const handleRefineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) handleRefine();
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 4 — IMAGE-TO-CODE (Screenshot → Code)
  // ════════════════════════════════════════════════════════════
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearUploadedImage = () => {
    setUploadedImage(null);
    setImageFileName('');
  };

  const handleCodeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCodeFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCodeFileContent(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearCodeFile = () => {
    setCodeFileContent(null);
    setCodeFileName('');
  };

  // ════════════════════════════════════════════════════════════
  //  FEATURE 5 — DEPRECATION MIGRATION WIZARD
  // ════════════════════════════════════════════════════════════
  const handleMigrate = async () => {
    const inputToMigrate = activeMigrateInput.trim();
    if (!inputToMigrate || migrateLoading) return;

    if (migrationFlow === 'upgrade') {
      if (!upgradeFromVersion || !upgradeToVersion) {
        setActiveMigrateError(ui('upgradeVersionRequired'));
        return;
      }
      if ((IX_VERSION_ORDER[upgradeToVersion] || 0) <= (IX_VERSION_ORDER[upgradeFromVersion] || 0)) {
        setActiveMigrateError(ui('upgradeVersionOrderError'));
        return;
      }
    }

    if (!hasCodegenPremium) {
      setActiveMigrateError(ui('migrationNeedsKey'));
      return;
    }
    setMigrateLoading(true);
    setActiveMigrateError('');
    setActiveMigrateOutput('');
    setActiveMigrateSummary('');
    setActiveMigrateSourceInput(activeMigrateInput);
    setActiveMigrateFeedback(createFeedbackState());
    migrateAbortRef.current?.abort();
    migrateAbortRef.current = new AbortController();
    try {
      const res = await fetch(MIGRATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: migrateAbortRef.current.signal,
        body: JSON.stringify({
          code: activeMigrateInput,
          apiKey: codegenActiveKey,
          lang,
          provider: codegenProvider,
          model: effectiveCodegenModel,
          flow: migrationFlow,
          fromVersion: migrationFlow === 'upgrade' ? upgradeFromVersion : undefined,
          toVersion: migrationFlow === 'upgrade' ? upgradeToVersion : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setActiveMigrateOutput(data.migratedCode || '');
      setActiveMigrateSummary(data.summary || '');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setActiveMigrateError(err.message || ui('migrationFailed'));
    } finally {
      setMigrateLoading(false);
    }
  };

  const clearMigrate = () => {
    migrateAbortRef.current?.abort();
    migrateAbortRef.current = null;
    setMigrateLoading(false);
    if (migrationFlow === 'upgrade') {
      setMigrateUpgradeInput('');
      setMigrateUpgradeSourceInput('');
      setMigrateUpgradeOutput('');
      setMigrateUpgradeError('');
      setMigrateUpgradeSummary('');
      setMigrateUpgradeFeedback(createFeedbackState());
    } else {
      setMigrateApiInput('');
      setMigrateApiSourceInput('');
      setMigrateApiOutput('');
      setMigrateApiError('');
      setMigrateApiSummary('');
      setMigrateApiFeedback(createFeedbackState());
    }
  };

  const submitCodegenRating = (rating: FeedbackRating) => {
    if (!generatedCode || codegenFeedback.submitted || codegenFeedback.submitting) return;

    if (rating === 'down') {
      setCodegenFeedback((prev) => ({ ...prev, rating, showCorrection: true, error: '' }));
      return;
    }

    setCodegenFeedback((prev) => ({ ...prev, rating, submitting: true, error: '', showCorrection: false }));
    submitFeedback({
      scope: 'codegen',
      rating: 'up',
      userInput: description,
      aiOutput: stripCodeFence(generatedCode),
      onSuccess: () => setCodegenFeedback((prev) => ({ ...prev, submitting: false, submitted: true })),
      onError: (message) => setCodegenFeedback((prev) => ({ ...prev, submitting: false, error: message })),
    });
  };

  const submitCodegenCorrection = () => {
    if (!generatedCode || codegenFeedback.submitted || codegenFeedback.submitting) return;
    setCodegenFeedback((prev) => ({ ...prev, submitting: true, error: '' }));
    submitFeedback({
      scope: 'codegen',
      rating: 'down',
      correction: codegenFeedback.correction,
      userInput: description,
      aiOutput: stripCodeFence(generatedCode),
      onSuccess: () => setCodegenFeedback((prev) => ({ ...prev, submitting: false, submitted: true, showCorrection: false })),
      onError: (message) => setCodegenFeedback((prev) => ({ ...prev, submitting: false, error: message })),
    });
  };

  const submitMigrateRating = (rating: FeedbackRating) => {
    if (!activeMigrateOutput || activeMigrateFeedback.submitted || activeMigrateFeedback.submitting) return;

    if (rating === 'down') {
      setActiveMigrateFeedback((prev) => ({ ...prev, rating, showCorrection: true, error: '' }));
      return;
    }

    setActiveMigrateFeedback((prev) => ({ ...prev, rating, submitting: true, error: '', showCorrection: false }));
    submitFeedback({
      scope: 'migrate',
      rating: 'up',
      userInput: activeMigrateSourceInput,
      aiOutput: `${activeMigrateSummary}\n\n${stripCodeFence(activeMigrateOutput)}`,
      onSuccess: () => setActiveMigrateFeedback((prev) => ({ ...prev, submitting: false, submitted: true })),
      onError: (message) => setActiveMigrateFeedback((prev) => ({ ...prev, submitting: false, error: message })),
    });
  };

  const submitMigrateCorrection = () => {
    if (!activeMigrateOutput || activeMigrateFeedback.submitted || activeMigrateFeedback.submitting) return;
    setActiveMigrateFeedback((prev) => ({ ...prev, submitting: true, error: '' }));
    submitFeedback({
      scope: 'migrate',
      rating: 'down',
      correction: activeMigrateFeedback.correction,
      userInput: activeMigrateSourceInput,
      aiOutput: `${activeMigrateSummary}\n\n${stripCodeFence(activeMigrateOutput)}`,
      onSuccess: () => setActiveMigrateFeedback((prev) => ({ ...prev, submitting: false, submitted: true, showCorrection: false })),
      onError: (message) => setActiveMigrateFeedback((prev) => ({ ...prev, submitting: false, error: message })),
    });
  };

  const handleMigrateCopy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const handleMigrateDownload = () => {
    if (!activeMigrateOutput.trim()) return;

    setActiveMigrateError('');

    try {
      downloadBlob(
        new Blob([stripCodeFence(activeMigrateOutput)], { type: 'text/plain;charset=utf-8' }),
        'ix-migrated-code.txt'
      );
    } catch (err: any) {
      setActiveMigrateError(err?.message || ui('somethingWentWrong'));
    }
  };

  /** Simple line-level diff renderer between old and migrated code */
  const computeDiff = (oldCode: string, newCode: string) => {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.replace(/^```[\w-]*\n?/gm, '').replace(/```$/gm, '').trim().split('\n');
    const result: { text: string; type: 'removed' | 'added' | 'unchanged' }[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o === undefined) {
        result.push({ text: n, type: 'added' });
      } else if (n === undefined) {
        result.push({ text: o, type: 'removed' });
      } else if (o === n) {
        result.push({ text: o, type: 'unchanged' });
      } else {
        result.push({ text: o, type: 'removed' });
        result.push({ text: n, type: 'added' });
      }
    }
    return result;
  };

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  const panelMaxHeight =
    typeof window !== 'undefined' ? getPanelMaxHeightPx() : panelHeight;
  const panelHeightClamped = Math.min(panelHeight, panelMaxHeight);

  return (
    <>
      {/* ── Single floating action button ── */}
      <button
        className={styles.fab}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? ui('closeAssistant') : ui('openAssistant')}
        title={ui('assistantTitle')}
      >
        {isOpen ? '✕' : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1 }}>
            <span style={{ fontSize: 15 }}>🤖</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, fontSize: 8, fontWeight: 600, letterSpacing: '0.01em' }}>
              <span>iX</span>
              <span>Assistant</span>
            </span>
          </span>
        )}
      </button>

      {/* ── Unified panel ── */}
      {isOpen && (
        <div
          ref={panelRef}
          className={styles.panel}
          style={{ width: panelWidth, height: panelHeightClamped, maxHeight: panelMaxHeight }}
        >
          {/* ── Resize handles ── */}
          <div
            className={styles.resizeTop}
            onPointerDown={(e) => startResize(e, 'top')}
          />
          <div
            className={styles.resizeLeft}
            onPointerDown={(e) => startResize(e, 'left')}
          />
          <div
            className={styles.resizeCorner}
            onPointerDown={(e) => startResize(e, 'corner')}
          />

          {/* Header with mode tabs */}
          {(() => {
            // All overflow items with icon + label
            const MORE_ITEMS: { id: Mode; icon: string; label: string }[] = [
              { id: 'migrate', icon: '↔', label: ui('migrate') },
              { id: 'analytics', icon: '◫', label: ui('analyticsTitle') },
              { id: 'settings', icon: '⚙', label: ui('settings') },
              { id: 'help', icon: '?', label: ui('help') },
            ];
            // If the active mode is an overflow item, float it up as a visible tab.
            const promotedItem = MORE_ITEMS.find((m) => m.id === mode) ?? null;
            // Remaining items stay in the dropdown.
            const dropdownItems = MORE_ITEMS.filter((m) => m.id !== mode);
            const switchMode = (m: Mode) => {
              setMode(m);
              setShowChatHistory(false);
              setShowCodeGenHistory(false);
              setShowMoreMenu(false);
              setShowTierModelMenu(false);
            };
            return (
              <div className={styles.header}>
                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${mode === 'chat' ? styles.tabActive : ''}`}
                    onClick={() => switchMode('chat')}
                  >
                    <span className={styles.tabIcon}>💬</span>
                    <span className={styles.tabLabel}>{ui('chat')}</span>
                  </button>
                  <button
                    className={`${styles.tab} ${mode === 'codegen' ? styles.tabActive : ''}`}
                    onClick={() => switchMode('codegen')}
                  >
                    <span className={styles.tabIcon}>&lt;/&gt;</span>
                    <span className={styles.tabLabel}>{ui('codeGen')}</span>
                  </button>

                  {/* Promoted "more" tab — shown when an overflow mode is active */}
                  {promotedItem && (
                    <button
                      className={`${styles.tab} ${styles.tabActive} ${styles.tabPromoted}`}
                      onClick={() => switchMode(promotedItem.id)}
                    >
                      <span className={styles.tabIcon}>{promotedItem.icon}</span>
                      <span className={styles.tabLabel}>{promotedItem.label}</span>
                    </button>
                  )}

                  {/* ── ··· More dropdown ── */}
                  <div className={styles.moreMenuWrapper} data-more-menu>
                    <button
                      className={`${styles.tab} ${styles.moreBtn} ${showMoreMenu ? styles.moreBtnOpen : ''}`}
                      onClick={() => setShowMoreMenu((v) => !v)}
                      title={ui('moreOptions')}
                    >
                      <span className={styles.tabIcon}>···</span>
                      <span className={styles.tabLabel}>{ui('more')}</span>
                    </button>
                    {showMoreMenu && (
                      <div className={styles.moreMenu}>
                        {dropdownItems.map((item) => (
                          <button
                            key={item.id}
                            className={styles.moreMenuItem}
                            onClick={() => switchMode(item.id)}
                          >
                            {item.icon} {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
            <div className={styles.headerActions}>
              {mode !== 'settings' && mode !== 'account' && mode !== 'help' && mode !== 'analytics' && (
                <>
                  {mode !== 'migrate' && (
                    <button
                      className={styles.historyBtn}
                      onClick={() => {
                        if (mode === 'chat') setShowChatHistory((v) => !v);
                        else setShowCodeGenHistory((v) => !v);
                      }}
                      title="History"
                    >
                      🕘
                    </button>
                  )}
                  <button
                    className={styles.clearBtn}
                    onClick={
                      mode === 'chat'
                        ? clearChat
                        : mode === 'migrate'
                        ? clearMigrate
                        : clearCodeGen
                    }
                    title={ui('clear')}
                  >
                    🗑
                  </button>
                </>
              )}
              <button
                className={styles.accountBtn}
                onClick={() => switchMode('account')}
                title={ui('account')}
              >
                👤
              </button>
            </div>
          </div>
            );
          })()}

          {/* ─────── Tier banner ─────── */}
          {mode !== 'settings' && mode !== 'account' && mode !== 'migrate' && mode !== 'help' && mode !== 'analytics' && !keyLoading && !groqKeyLoading && (
            <div className={(mode === 'chat' ? hasChatPremium : hasCodegenPremium) ? styles.tierBannerPremium : styles.tierBannerFree}>
              {(mode === 'chat' ? hasChatPremium : hasCodegenPremium) ? (
                (() => {
                  const isCodegenMode = mode === 'codegen';
                  const activeProvider = isCodegenMode ? codegenProvider : chatProvider;
                  const activeModel = isCodegenMode ? effectiveCodegenModel : effectiveChatModel;

                  return (
                    <>
                      <div className={styles.tierBannerPremiumInfo}>
                        🔑 <strong>{PROVIDER_LABELS[activeProvider]}</strong>
                        {' · '}
                        <span className={styles.tierModelBadge}>
                          {PROVIDER_MODELS[activeProvider].find(m => m.id === activeModel)?.label ?? activeModel}
                        </span>
                      </div>
                      <div className={styles.tierBannerModelWrap} data-tier-model-menu>
                        <button
                          className={styles.tierBannerModelBtn}
                          onClick={() => setShowTierModelMenu((v) => !v)}
                          title={ui('changeProviderModel')}
                          aria-label={ui('changeProviderModel')}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            <circle cx="6" cy="4" r="1.6" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1" />
                            <circle cx="10" cy="8" r="1.6" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1" />
                            <circle cx="7.5" cy="12" r="1.6" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1" />
                          </svg>
                        </button>
                        {showTierModelMenu && (
                          <div className={styles.tierBannerModelMenu}>
                            <div className={styles.tierBannerModelField}>
                              <label className={styles.modelSelectorLabel} htmlFor="tier-provider-select">{ui('provider')}</label>
                              <select
                                id="tier-provider-select"
                                className={styles.selectorSelect}
                                value={activeProvider}
                                onChange={(e) => {
                                  const nextProvider = e.target.value as Provider;
                                  if (isCodegenMode) switchCodegenProvider(nextProvider);
                                  else switchChatProvider(nextProvider);
                                }}
                              >
                                <option value="siemens" disabled={!hasSiemensKey}>
                                  Siemens{!hasSiemensKey ? ui('addKeyInSettingsSuffix') : ''}
                                </option>
                                <option value="groq" disabled={!hasGroqKey}>
                                  Groq{!hasGroqKey ? ui('addKeyInSettingsSuffix') : ''}
                                </option>
                              </select>
                            </div>
                            <div className={styles.tierBannerModelField}>
                              <label className={styles.modelSelectorLabel} htmlFor="tier-model-select">{ui('model')}</label>
                              <select
                                id="tier-model-select"
                                className={styles.selectorSelect}
                                value={activeModel}
                                disabled={!providerHasKey(activeProvider)}
                                onChange={(e) => {
                                  const nextModel = e.target.value;
                                  if (isCodegenMode) {
                                    setCodegenModel(resolveModelForProvider(codegenProvider, nextModel, 'codegen'));
                                  } else {
                                    setChatModel(resolveModelForProvider(chatProvider, nextModel, 'chat'));
                                  }
                                }}
                              >
                                {PROVIDER_MODELS[activeProvider].map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.label}{m.recommended ? ' ★' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
                  🆓 <strong>{ui('freeTier')}</strong> —{' '}
                  <button className={styles.tierLink} onClick={() => setMode('settings')}>
                    {ui('addApiKey')}
                  </button>{' '}
                  {ui('forAiResponses')}
                </>
              )}
            </div>
          )}

          {/* ─────── Chat View ─────── */}
          {mode === 'chat' && (
            <div className={styles.chatBody}>
              {/* Chat History Drawer (overlay) */}
              {showChatHistory && (
                <div className={styles.historyDrawer}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>💬 {ui('chatHistory')}</span>
                    <button
                      className={styles.historyClose}
                      onClick={() => setShowChatHistory(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {chatHistory.length === 0 ? (
                    <div className={styles.historyEmpty}>
                      {ui('noSavedChatSessions')}
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {chatHistory.map((session) => (
                        <div key={session.id} className={styles.historyItem}>
                          <button
                            className={styles.historyItemBtn}
                            onClick={() => restoreChatSession(session)}
                            title={`${ui('restore')}: ${session.title}`}
                          >
                            <span className={styles.historyItemTitle}>{session.title}</span>
                            <span className={styles.historyItemMeta}>
                              {session.messages.filter((m) => m.role === 'user').length} messages · {formatTimestamp(session.timestamp)}
                            </span>
                          </button>
                          <button
                            className={styles.historyDeleteBtn}
                            onClick={() => deleteChatSession(session.id)}
                            title={ui('delete')}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.messages}>
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${styles.bubble} ${
                      msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot
                    }`}
                  >
                    <span className={styles.bubbleLabel}>
                      {msg.role === 'user'
                        ? ui('you')
                        : msg.tier === 'premium'
                        ? ui('ixBotPremium')
                        : ui('ixBot')}
                    </span>
                    <p className={styles.bubbleText}>{msg.text}</p>
                    {msg.role === 'bot' && (
                      <div className={styles.bubbleActions}>
                        <button
                          className={`${styles.speakBtn} ${speakingIndex === i ? styles.speakBtnActive : ''}`}
                          onClick={() => toggleReadAloud(msg.text, i)}
                          title={speakingIndex === i ? ui('stopReading') : ui('readAloud')}
                          aria-label={speakingIndex === i ? ui('stopReading') : ui('readAloud')}
                        >
                          {speakingIndex === i ? (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M2.5 6.5h3l3-2v7l-3-2h-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                              <path d="M10.8 6a2.8 2.8 0 0 1 0 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                              <path d="M12.6 4.5a4.9 4.9 0 0 1 0 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                    {/* Deprecation warning banner */}
                    {msg.role === 'bot' && msg.hasDeprecationWarnings && (
                      <div className={styles.deprecationBanner}>
                        {ui('responseHasDeprecationWarning')}
                      </div>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className={styles.sourcesRow}>
                        <span className={styles.sourcesLabel}>📖 {ui('sourcesLabel')}</span>
                        {msg.sources.map((src, si) => (
                          <a
                            key={si}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${styles.sourceLink} ${src.deprecated ? styles.sourceLinkDeprecated : ''}`}
                            title={src.deprecated ? `⚠️ Deprecated — ${src.title}` : src.title}
                          >
                            {src.deprecated ? '⚠️ ' : ''}{src.title.length > 30 ? src.title.slice(0, 30) + '…' : src.title}
                          </a>
                        ))}
                      </div>
                    )}
                    {isChatMessageFeedbackEligible(msg) && (
                      <div className={styles.feedbackBox}>
                        <div className={styles.feedbackRow}>
                          <span className={styles.feedbackTitle}>{ui('feedbackTitle')}</span>
                          <button
                            className={`${styles.feedbackBtn} ${msg.feedback?.rating === 'up' ? styles.feedbackBtnActive : ''}`}
                            onClick={() => handleChatRating(i, 'up')}
                            disabled={msg.feedback?.submitted || msg.feedback?.submitting}
                            title={ui('thumbsUp')}
                          >
                            {ui('thumbsUp')}
                          </button>
                          <button
                            className={`${styles.feedbackBtn} ${msg.feedback?.rating === 'down' ? styles.feedbackBtnActive : ''}`}
                            onClick={() => handleChatRating(i, 'down')}
                            disabled={msg.feedback?.submitted || msg.feedback?.submitting}
                            title={ui('thumbsDown')}
                          >
                            {ui('thumbsDown')}
                          </button>
                        </div>
                        {msg.feedback?.showCorrection && !msg.feedback?.submitted && (
                          <div className={styles.feedbackCorrectionRow}>
                            <input
                              className={styles.feedbackInput}
                              type="text"
                              value={msg.feedback?.correction || ''}
                              placeholder={ui('feedbackCorrectionPlaceholder')}
                              onChange={(e) => updateChatFeedback(i, { correction: e.target.value })}
                              disabled={msg.feedback?.submitting}
                            />
                            <button
                              className={styles.feedbackSubmitBtn}
                              onClick={() => submitChatCorrection(i)}
                              disabled={msg.feedback?.submitting}
                            >
                              {msg.feedback?.submitting ? ui('sendingFeedback') : ui('submitFeedback')}
                            </button>
                          </div>
                        )}
                        {msg.feedback?.submitted && (
                          <div className={styles.feedbackThanks}>{ui('feedbackThanks')}</div>
                        )}
                        {msg.feedback?.error && (
                          <div className={styles.feedbackError}>⚠️ {msg.feedback.error}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className={`${styles.bubble} ${styles.bubbleBot}`}>
                    <span className={styles.bubbleLabel}>{ui('ixBotPremium')}</span>
                    <span className={styles.typing}>{ui('thinking')}</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {chatError && (
                <div className={styles.error}>
                  ⚠️ {chatError}
                  <button className={styles.errorClose} onClick={() => setChatError('')}>
                    ✕
                  </button>
                </div>
              )}

              {deprecationHint && (
                <div className={styles.deprecationHint}>
                  {deprecationHint}
                </div>
              )}
              <div className={styles.inputRow}>
                <button
                  className={`${styles.micBtn} ${isListening ? styles.micBtnActive : ''}`}
                  onClick={toggleVoice}
                  title={isListening ? ui('stopListening') : ui('voiceInput')}
                  aria-label={isListening ? ui('stopVoiceInput') : ui('startVoiceInput')}
                >
                  {isListening ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M2 8a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="8" y1="14" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                <input
                  ref={chatInputRef}
                  className={styles.input}
                  type="text"
                  placeholder={isListening ? ui('listening') : ui('askPlaceholder')}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  disabled={chatLoading}
                />
                <button
                  className={styles.sendBtn}
                  onClick={sendMessage}
                  disabled={chatLoading || !question.trim()}
                >
                  {ui('send')}
                </button>
              </div>
            </div>
          )}

          {/* ─────── Code Generator View ─────── */}
          {mode === 'codegen' && (
            <div className={styles.codeBody}>
              {/* Code Gen History Drawer (overlay) */}
              {showCodeGenHistory && (
                <div className={styles.historyDrawer}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>&lt;/&gt; {ui('codeGenHistory')}</span>
                    <button
                      className={styles.historyClose}
                      onClick={() => setShowCodeGenHistory(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {codeGenHistory.length === 0 ? (
                    <div className={styles.historyEmpty}>
                      {ui('noSavedCodegenSessions')}
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {codeGenHistory.map((session) => (
                        <div key={session.id} className={styles.historyItem}>
                          <button
                            className={styles.historyItemBtn}
                            onClick={() => restoreCodeGenSession(session)}
                            title={`${ui('restore')}: ${session.title}`}
                          >
                            <span className={styles.historyItemTitle}>{session.title}</span>
                            <span className={styles.historyItemMeta}>
                              {FRAMEWORK_LABELS[session.framework]} · {formatTimestamp(session.timestamp)}
                            </span>
                          </button>
                          <button
                            className={styles.historyDeleteBtn}
                            onClick={() => deleteCodeGenSession(session.id)}
                            title={ui('delete')}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Upload tools: Screenshot → Code + Code File ─────────── */}
              {false && (
              <div className={styles.uploadGrid}>
                {/* Screenshot slot */}
                <div className={styles.uploadSlot}>
                  <span className={styles.uploadSlotLabel}>📷 Screenshot</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                  {!uploadedImage ? (
                    <button
                      className={styles.uploadSlotBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={codeLoading}
                      title="Upload a UI screenshot to generate code from it (requires API key)"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M1 12V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.2"/>
                        <circle cx="5.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M1 10l3.5-3 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                      Upload image
                    </button>
                  ) : (
                    <div className={styles.uploadSlotPreview}>
                      <img src={uploadedImage} alt={imageFileName} className={styles.uploadSlotThumb} />
                      <div className={styles.uploadSlotMeta}>
                        <span className={styles.uploadSlotName}>{imageFileName}</span>
                        <button className={styles.uploadSlotClear} onClick={clearUploadedImage} title="Remove screenshot">✕ Remove</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Code file slot */}
                <div className={styles.uploadSlot}>
                  <span className={styles.uploadSlotLabel}>📄 Code File</span>
                  <input
                    ref={codeFileInputRef}
                    type="file"
                    accept=".html,.htm,.tsx,.ts,.jsx,.js,.css,.scss,.vue,.json,.md,.txt"
                    style={{ display: 'none' }}
                    onChange={handleCodeFileUpload}
                  />
                  {!codeFileContent ? (
                    <button
                      className={styles.uploadSlotBtn}
                      onClick={() => codeFileInputRef.current?.click()}
                      disabled={codeLoading}
                      title="Upload an existing code file to refactor or extend it with iX components"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M6 8h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      Upload file
                    </button>
                  ) : (
                    <div className={styles.uploadSlotPreview}>
                      <div className={styles.uploadSlotFileIcon}>
                        {codeFileName.split('.').pop()?.toUpperCase() || 'FILE'}
                      </div>
                      <div className={styles.uploadSlotMeta}>
                        <span className={styles.uploadSlotName}>{codeFileName}</span>
                        <span className={styles.uploadSlotSize}>{codeFileContent.length.toLocaleString()} chars</span>
                        <button className={styles.uploadSlotClear} onClick={clearCodeFile} title="Remove file">✕ Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Description input */}
              <div className={styles.section}>
                <label className={styles.label}>{ui('describeYourUi')}</label>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  placeholder={ui('describeUiPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={handleCodeKeyDown}
                  rows={3}
                  disabled={codeLoading}
                />
                <span className={styles.hint}>{ui('pressCtrlEnter')}</span>
              </div>

              {/* Example prompts */}
              {!generatedCode && !codeLoading && (
                <div className={styles.section}>
                  <label className={styles.label}>{ui('tryExample')}</label>
                  <div className={styles.examples}>
                    {EXAMPLE_PROMPTS.map((prompt, i) => (
                      <button
                        key={i}
                        className={styles.exampleBtn}
                        onClick={() => handleExampleClick(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Feature 3: Visual Component Picker ──────────────────────── */}
              <div className={styles.section}>
                <div className={styles.compPickerHeader}>
                  <label className={styles.label}>📦 {ui('componentPicker')}</label>
                  <button
                    className={styles.compPickerToggle}
                    onClick={() => { setShowCompPicker(v => !v); setCompSearch(''); }}
                  >
                    {showCompPicker ? ui('hide') : ui('browseAndAdd')}
                  </button>
                </div>
                {showCompPicker && (
                  <div className={styles.compPickerBox}>
                    <input
                      className={styles.compPickerSearch}
                      type="text"
                      placeholder={ui('searchComponentsPlaceholder')}
                      value={compSearch}
                      onChange={(e) => setCompSearch(e.target.value)}
                      autoFocus
                    />
                    <div className={styles.compPickerGrid}>
                      {IX_COMPONENTS
                        .filter(c => !compSearch || c.includes(compSearch.toLowerCase().trim()))
                        .map(comp => (
                          <button
                            key={comp}
                            className={styles.compPickerChip}
                            onClick={() => {
                              setDescription(prev =>
                                prev ? `${prev.trimEnd()}, use ${comp}` : `Use ${comp}`
                              );
                              textareaRef.current?.focus();
                            }}
                            title={ui('addComponentToPrompt', { component: comp })}
                          >
                            {comp.replace('ix-', '')}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* Framework selector */}
              <div className={styles.section}>
                <label className={styles.label}>{ui('framework')}</label>
                <div className={styles.frameworkRow}>
                  {(Object.entries(FRAMEWORK_LABELS) as [Framework, string][]).map(
                    ([key, label]) => (
                      <button
                        key={key}
                        className={`${styles.frameworkBtn} ${
                          framework === key ? styles.frameworkBtnActive : ''
                        }`}
                        onClick={() => setFramework(key)}
                        disabled={codeLoading}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Generate button */}
              <button
                className={styles.generateBtn}
                onClick={handleGenerate}
                disabled={codeLoading || !description.trim()}
              >
                {codeLoading ? <span className={styles.spinner} /> : '⚡'}{' '}
                {codeLoading ? ui('generating') : ui('generateCode')}
              </button>

              {/* Error */}
              {codeError && (
                <div className={styles.error}>
                  ⚠️ {codeError}
                  <button className={styles.errorClose} onClick={() => setCodeError('')}>
                    ✕
                  </button>
                </div>
              )}

              {/* Info message (includes gate message when no key) */}
              {codeMessage && (
                <div className={styles.info}>
                  {codeMessage}
                  {!hasPremium && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className={styles.settingsLinkBtn}
                        onClick={() => setMode('settings')}
                      >
                        {ui('settingsArrow')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Matched components */}
              {matchedComponents.length > 0 && (
                <div className={styles.section}>
                  <label className={styles.label}>
                    📚 {ui('componentsUsed', { count: matchedComponents.length })}
                  </label>
                  <div className={styles.chips}>
                    {matchedComponents.map((comp, i) => (
                      <span
                        key={i}
                        className={`${styles.chip} ${comp.deprecated ? styles.chipDeprecated : ''}`}
                        title={comp.deprecated
                          ? `⚠️ Deprecated — Keywords: ${(comp.matchedKeywords || []).join(', ')}`
                          : `Keywords: ${(comp.matchedKeywords || []).join(', ')}`}
                      >
                        {comp.deprecated ? '⚠️ ' : ''}{comp.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated code */}
              {generatedCode && (
                <div className={styles.section}>
                  <div className={styles.codeHeader}>
                    <label className={styles.label}>{ui('generatedCode')}</label>
                    <div className={styles.codeActions}>
                      <button
                        className={styles.stackblitzBtn}
                        onClick={openInStackBlitz}
                        disabled={codeLoading}
                        title={ui('openInStackblitz')}
                      >
                        <svg width="13" height="13" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M12 2L2 14h9l-3 12 17-14h-9l3-10z" fill="currentColor"/>
                        </svg>
                        StackBlitz
                      </button>
                      <button
                        className={styles.regenerateBtn}
                        onClick={handleGenerate}
                        disabled={codeLoading}
                        title={ui('regenerateCode')}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M13.65 2.35A8 8 0 1 0 15 8h-2a6 6 0 1 1-1.05-3.39L9.5 7H15V1.5l-1.35.85z" fill="currentColor"/>
                        </svg>
                        {ui('regenerate')}
                      </button>
                      <button
                        className={styles.downloadBtn}
                        onClick={handleDownload}
                        disabled={codeLoading}
                        title={ui('downloadCode')}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                          <path d="M8 2v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          <path d="M5.25 6.75L8 9.5l2.75-2.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                        </svg>
                        {ui('download')}
                      </button>
                      <button className={styles.copyBtn} onClick={handleCopy} title={copied ? ui('copied') : ui('copyCode')}>
                        {copied ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {ui('copied')}
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <rect x="5" y="1" width="9" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                              <rect x="2" y="4" width="9" height="11" rx="2" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                            {ui('copy')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <pre className={styles.codeBlock}>
                    <code>
                      {stripCodeFence(generatedCode)}
                    </code>
                  </pre>
                  <div className={styles.feedbackBox}>
                    <div className={styles.feedbackRow}>
                      <span className={styles.feedbackTitle}>{ui('feedbackTitle')}</span>
                      <button
                        className={`${styles.feedbackBtn} ${codegenFeedback.rating === 'up' ? styles.feedbackBtnActive : ''}`}
                        onClick={() => submitCodegenRating('up')}
                        disabled={codegenFeedback.submitted || codegenFeedback.submitting}
                        title={ui('thumbsUp')}
                      >
                        {ui('thumbsUp')}
                      </button>
                      <button
                        className={`${styles.feedbackBtn} ${codegenFeedback.rating === 'down' ? styles.feedbackBtnActive : ''}`}
                        onClick={() => submitCodegenRating('down')}
                        disabled={codegenFeedback.submitted || codegenFeedback.submitting}
                        title={ui('thumbsDown')}
                      >
                        {ui('thumbsDown')}
                      </button>
                    </div>
                    {codegenFeedback.showCorrection && !codegenFeedback.submitted && (
                      <div className={styles.feedbackCorrectionRow}>
                        <input
                          className={styles.feedbackInput}
                          type="text"
                          value={codegenFeedback.correction}
                          placeholder={ui('feedbackCorrectionPlaceholder')}
                          onChange={(e) => setCodegenFeedback((prev) => ({ ...prev, correction: e.target.value }))}
                          disabled={codegenFeedback.submitting}
                        />
                        <button
                          className={styles.feedbackSubmitBtn}
                          onClick={submitCodegenCorrection}
                          disabled={codegenFeedback.submitting}
                        >
                          {codegenFeedback.submitting ? ui('sendingFeedback') : ui('submitFeedback')}
                        </button>
                      </div>
                    )}
                    {codegenFeedback.submitted && <div className={styles.feedbackThanks}>{ui('feedbackThanks')}</div>}
                    {codegenFeedback.error && <div className={styles.feedbackError}>⚠️ {codegenFeedback.error}</div>}
                  </div>
                </div>
              )}

              {/* ── Feature 1: Conversational Code Refinement ───────────────── */}
              {false && generatedCode && (
                <div className={styles.refineRow}>
                  <input
                    className={styles.refineInput}
                    type="text"
                    placeholder={ui('refinePlaceholder')}
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={handleRefineKeyDown}
                    disabled={refineLoading}
                  />
                  <button
                    className={styles.refineBtn}
                    onClick={handleRefine}
                    disabled={refineLoading || !refineInput.trim()}
                    title={ui('refineTitle')}
                  >
                    {refineLoading ? <span className={styles.spinner} /> : '\u2728'} {ui('refine')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─────── Account View ─────── */}
          {mode === 'account' && (
            <div className={styles.settingsBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('accountTitle')}</h3>
                <p className={styles.settingsDescription}>
                  {ui('accountDescription')}
                </p>
              </div>

              {/* User Profile Form */}
              <div className={styles.settingsSection}>
                <div className={styles.section}>
                  <label className={styles.label}>{ui('userName')}</label>
                  <input
                    className={styles.keyInput}
                    type="text"
                    placeholder={ui('userNamePlaceholder')}
                    value={userFormInput.name || ''}
                    onChange={(e) => updateUserFormField('name', e.target.value)}
                  />
                </div>

                <div className={styles.section}>
                  <label className={styles.label}>{ui('userEmail')}</label>
                  <input
                    className={styles.keyInput}
                    type="email"
                    placeholder={ui('userEmailPlaceholder')}
                    value={userFormInput.email || ''}
                    onChange={(e) => updateUserFormField('email', e.target.value)}
                  />
                </div>

                <div className={styles.section}>
                  <label className={styles.label}>{ui('responseLanguageTitle')}</label>
                  <select
                    className={styles.selectorSelect}
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Language)}
                  >
                    {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.section}>
                  <label className={styles.label}>
                    <input
                      type="checkbox"
                      checked={userFormInput.notificationsEnabled ?? true}
                      onChange={(e) => updateUserFormField('notificationsEnabled', e.target.checked)}
                      style={{ marginRight: 8, cursor: 'pointer' }}
                    />
                    {ui('notificationsEnabled')}
                  </label>
                  <p className={styles.settingsDescription} style={{ marginTop: 4 }}>
                    {ui('notificationsDescription')}
                  </p>
                </div>

                <button
                  className={styles.saveKeyBtn}
                  onClick={saveUserProfile}
                  disabled={profileSaveStatus === 'saving'}
                  style={{ marginTop: 12 }}
                >
                  {profileSaveStatus === 'saving' ? (
                    <><span className={styles.spinner} /> {ui('loading')}</>
                  ) : (
                    ui('saveProfile')
                  )}
                </button>

                {profileSaveStatus === 'success' && (
                  <div className={styles.info} style={{ marginTop: 12 }}>
                    {ui('profileSaved')}
                  </div>
                )}

                {profileSaveStatus === 'error' && (
                  <div className={styles.error} style={{ marginTop: 12 }}>
                    {ui('profileSaveError')}
                    <button className={styles.errorClose} onClick={() => setProfileSaveStatus('idle')}>✕</button>
                  </div>
                )}
              </div>

              {/* User Statistics */}
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('accountStats')}</h3>
                <table className={styles.tierTable}>
                  <tbody>
                    <tr>
                      <td>{ui('chatSessions')}</td>
                      <td style={{ textAlign: 'center' }}><strong>{chatHistory.length}</strong></td>
                    </tr>
                    <tr>
                      <td>{ui('codeGenSessions')}</td>
                      <td style={{ textAlign: 'center' }}><strong>{codeGenHistory.length}</strong></td>
                    </tr>
                    <tr>
                      <td>{ui('questionsAsked')}</td>
                      <td style={{ textAlign: 'center' }}><strong>{chatHistory.reduce((sum, session) => sum + session.messages.filter(m => m.role === 'user').length, 0)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* User Profile Info */}
              {userProfile && (
                <div className={styles.settingsSection}>
                  <h3 className={styles.settingsTitle}>Profile Created</h3>
                  <p className={styles.settingsDescription}>
                    {new Date(userProfile.createdAt).toLocaleDateString()} at {new Date(userProfile.createdAt).toLocaleTimeString()}
                  </p>
                  <p className={styles.settingsDescription} style={{ marginTop: 8, fontSize: '12px', color: 'var(--theme-color-std-text, rgba(245,252,255,0.7))' }}>
                    Last updated: {new Date(userProfile.lastUpdated).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─────── Settings View ─────── */}
          {mode === 'settings' && (
            <div className={styles.settingsBody}>
              {/* ─── API Key for selected provider ─── */}
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('settingsApiKey')}</h3>

                <div className={styles.selectorGroup} style={{ maxWidth: 320 }}>
                  <label className={styles.modelSelectorLabel} htmlFor="settings-api-provider">
                    {ui('providerKeyToManage')}
                  </label>
                  <select
                    id="settings-api-provider"
                    className={styles.selectorSelect}
                    value={settingsKeyProvider}
                    onChange={(e) => setSettingsKeyProvider(e.target.value as Provider)}
                  >
                    <option value="siemens">Siemens</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>

                {settingsKeyProvider === 'siemens' ? (
                  <>
                    <p className={styles.settingsDescription}>
                      {ui('siemensKeyDescription')}
                    </p>
                    <a href="https://my.siemens.com" target="_blank" rel="noopener noreferrer" className={styles.settingsLink}>
                      {ui('siemensKeyLink')}
                    </a>
                    <div style={{ marginTop: 12 }}>
                      <label className={styles.label}>
                        {keyLoading ? ui('keyLoadingLabel') : apiKey ? ui('siemensKeySavedEncrypted') : ui('enterSiemensApiKey')}
                      </label>
                      {keyLoading && <div className={styles.keyLoading}><span className={styles.spinner} /> {ui('keyDecrypting')}</div>}
                      {!keyLoading && apiKey && (
                        <div className={styles.keyStatus}>
                          <div className={styles.keyMasked}>{apiKey.slice(0, 6)}{'•'.repeat(20)}{apiKey.slice(-4)}</div>
                          <button className={styles.clearKeyBtn} onClick={clearApiKey}>{ui('removeKey')}</button>
                        </div>
                      )}
                      {!keyLoading && !apiKey && (
                        <>
                          <input
                            className={styles.keyInput}
                            type="password"
                            placeholder="SIAK-••••••••••••••••••••••••••••••••••"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button className={styles.saveKeyBtn} onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
                            {ui('saveKey')}
                          </button>
                        </>
                      )}
                      {apiKeySaved && <div className={styles.savedBadge}>{ui('siemensSavedBadge')}</div>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.settingsDescription}>
                      {ui('groqKeyDescription')}
                    </p>
                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className={styles.settingsLink}>
                      {ui('groqKeyLink')}
                    </a>
                    <div style={{ marginTop: 12 }}>
                      <label className={styles.label}>
                        {groqKeyLoading ? ui('keyLoadingLabel') : groqApiKey ? ui('groqKeySavedEncrypted') : ui('enterGroqApiKey')}
                      </label>
                      {groqKeyLoading && <div className={styles.keyLoading}><span className={styles.spinner} /> {ui('keyDecrypting')}</div>}
                      {!groqKeyLoading && groqApiKey && (
                        <div className={styles.keyStatus}>
                          <div className={styles.keyMasked}>{groqApiKey.slice(0, 6)}{'•'.repeat(20)}{groqApiKey.slice(-4)}</div>
                          <button className={styles.clearKeyBtn} onClick={clearGroqKey}>{ui('removeKey')}</button>
                        </div>
                      )}
                      {!groqKeyLoading && !groqApiKey && (
                        <>
                          <input
                            className={styles.keyInput}
                            type="password"
                            placeholder="gsk_••••••••••••••••••••••••••••••••••"
                            value={groqKeyInput}
                            onChange={(e) => setGroqKeyInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveGroqKey(); }}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button className={styles.saveKeyBtn} onClick={saveGroqKey} disabled={!groqKeyInput.trim()}>
                            {ui('saveKey')}
                          </button>
                        </>
                      )}
                      {groqKeySaved && <div className={styles.savedBadge}>{ui('groqSavedBadge')}</div>}
                    </div>
                  </>
                )}
              </div>

              {/* ─── Provider + model selectors ─── */}
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('providerModelTitle')}</h3>
                <p className={styles.settingsDescription}>
                  {ui('providerModelDescription')}
                </p>

                <div className={styles.settingsConfigGrid}>
                  <div className={styles.settingsConfigCard}>
                    <div className={styles.settingsConfigHeader}>
                      <span>💬 {ui('chat')}</span>
                      <span className={styles.settingsModelHint}>
                        {PROVIDER_LABELS[chatProvider]} · {PROVIDER_MODELS[chatProvider].find((m) => m.id === effectiveChatModel)?.label || effectiveChatModel}
                      </span>
                    </div>

                    <div className={styles.settingsConfigSelectRow}>
                      <div className={styles.selectorGroup}>
                        <label className={styles.modelSelectorLabel} htmlFor="settings-chat-provider">
                          {ui('provider')}
                        </label>
                        <select
                          id="settings-chat-provider"
                          className={styles.selectorSelect}
                          value={chatProvider}
                          onChange={(e) => switchChatProvider(e.target.value as Provider)}
                        >
                          <option value="siemens" disabled={!hasSiemensKey}>
                            Siemens{hasSiemensKey ? ui('keySavedSuffix') : ui('addKeyFirstSuffix')}
                          </option>
                          <option value="groq" disabled={!hasGroqKey}>
                            Groq{hasGroqKey ? ui('keySavedSuffix') : ui('addKeyFirstSuffix')}
                          </option>
                        </select>
                      </div>

                      <div className={styles.selectorGroup}>
                        <label className={styles.modelSelectorLabel} htmlFor="settings-chat-model">
                          {ui('model')}
                        </label>
                        <select
                          id="settings-chat-model"
                          className={styles.selectorSelect}
                          value={effectiveChatModel}
                          disabled={!providerHasKey(chatProvider)}
                          onChange={(e) => setChatModel(resolveModelForProvider(chatProvider, e.target.value, 'chat'))}
                        >
                          {PROVIDER_MODELS[chatProvider].map((m) => (
                            <option key={`chat-${m.id}`} value={m.id}>
                              {m.label}{m.recommended ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* <div className={styles.settingsConfigKeyRow}>
                      <span className={styles.settingsConfigKeyStatus}>
                        {chatProvider === 'siemens' ? (apiKey ? '✅ API key saved' : '⚠️ API key not added') : (groqApiKey ? '✅ API key saved' : '⚠️ API key not added')}
                      </span>
                      <button
                        className={styles.settingsLinkBtn}
                        onClick={() => setSettingsKeyProvider(chatProvider)}
                      >
                        {chatProvider === 'siemens' ? (apiKey ? 'Manage key' : 'Add API key') : (groqApiKey ? 'Manage key' : 'Add API key')}
                      </button>
                    </div> */}
                  </div>

                  <div className={styles.settingsConfigCard}>
                    <div className={styles.settingsConfigHeader}>
                      <span>⚡ {ui('codeGen')}</span>
                      <span className={styles.settingsModelHint}>
                        {PROVIDER_LABELS[codegenProvider]} · {PROVIDER_MODELS[codegenProvider].find((m) => m.id === effectiveCodegenModel)?.label || effectiveCodegenModel}
                      </span>
                    </div>

                    <div className={styles.settingsConfigSelectRow}>
                      <div className={styles.selectorGroup}>
                        <label className={styles.modelSelectorLabel} htmlFor="settings-codegen-provider">
                          {ui('provider')}
                        </label>
                        <select
                          id="settings-codegen-provider"
                          className={styles.selectorSelect}
                          value={codegenProvider}
                          onChange={(e) => switchCodegenProvider(e.target.value as Provider)}
                        >
                          <option value="siemens" disabled={!hasSiemensKey}>
                            Siemens{hasSiemensKey ? ui('keySavedSuffix') : ui('addKeyFirstSuffix')}
                          </option>
                          <option value="groq" disabled={!hasGroqKey}>
                            Groq{hasGroqKey ? ui('keySavedSuffix') : ui('addKeyFirstSuffix')}
                          </option>
                        </select>
                      </div>

                      <div className={styles.selectorGroup}>
                        <label className={styles.modelSelectorLabel} htmlFor="settings-codegen-model">
                          {ui('model')}
                        </label>
                        <select
                          id="settings-codegen-model"
                          className={styles.selectorSelect}
                          value={effectiveCodegenModel}
                          disabled={!providerHasKey(codegenProvider)}
                          onChange={(e) => setCodegenModel(resolveModelForProvider(codegenProvider, e.target.value, 'codegen'))}
                        >
                          {PROVIDER_MODELS[codegenProvider].map((m) => (
                            <option key={`codegen-${m.id}`} value={m.id}>
                              {m.label}{m.recommended ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* <div className={styles.settingsConfigKeyRow}>
                      <span className={styles.settingsConfigKeyStatus}>
                        {codegenProvider === 'siemens' ? (apiKey ? '✅ API key saved' : '⚠️ API key not added') : (groqApiKey ? '✅ API key saved' : '⚠️ API key not added')}
                      </span>
                      <button
                        className={styles.settingsLinkBtn}
                        onClick={() => setSettingsKeyProvider(codegenProvider)}
                      >
                        {codegenProvider === 'siemens' ? (apiKey ? 'Manage key' : 'Add API key') : (groqApiKey ? 'Manage key' : 'Add API key')}
                      </button>
                    </div> */}
                  </div>
                </div>
              </div>

              {/* ─── Language selector ─── */}
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('responseLanguageTitle')}</h3>
                <p className={styles.settingsDescription}>
                  {ui('responseLanguageDescription')}
                </p>
                <div className={styles.langRow}>
                  {(Object.entries(LANGUAGE_LABELS) as [Language, string][]).map(([code, label]) => (
                    <button
                      key={code}
                      className={`${styles.langBtn} ${lang === code ? styles.langBtnActive : ''}`}
                      onClick={() => setLang(code)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('freeVsAi')}</h3>
                <table className={styles.tierTable}>
                  <thead>
                    <tr>
                      <th>{ui('feature')}</th>
                      <th>{ui('free')}</th>
                      <th>{ui('withKey')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>{ui('ixFaqAnswers')}</td><td>✅</td><td>✅</td></tr>
                    <tr><td>{ui('componentLookup')}</td><td>✅</td><td>✅</td></tr>
                    <tr><td>{ui('chatAnswers')}</td><td>{ui('docsOnly')}</td><td>{ui('aiLlm')}</td></tr>
                    <tr><td>{ui('codeGeneration')}</td><td>—</td><td>✅</td></tr>
                    <tr><td>{ui('modelSelection')}</td><td>—</td><td>✅</td></tr>
                  </tbody>
                </table>
                <p className={styles.settingsNote}>
                  {ui('keysEncryptedPrefix')} <strong>{ui('keysEncryptedCore')}</strong> {ui('keysEncryptedSuffix')}
                </p>
              </div>

            </div>
          )}

          {/* ─────── Help View ─────── */}
          {mode === 'help' && (
            <div className={styles.settingsBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('help')}</h3>
                <div className={styles.helpLinks}>
                  <a
                    href="https://ix.siemens.io/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="5.5" y1="5.5" x2="10.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5.5" y1="8" x2="10.5" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5.5" y1="10.5" x2="8.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    {ui('docs')}
                  </a>
                  <a
                    href="https://ix.siemens.io/blog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <line x1="5" y1="10.5" x2="9" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    {ui('blog')}
                  </a>
                  <a
                    href="https://ix.siemens.io/docs/home/support/contact-us"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5s1.5.67 1.5 1.5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
                    </svg>
                    {ui('support')}
                  </a>
                  <a
                    href="https://ix.siemens.io/docs/home/getting-started/starter-app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.helpLink}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.helpLinkIcon}>
                      <path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v11a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5v-11z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {ui('starterApp')}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ─────── Analytics View ─────── */}
          {mode === 'analytics' && (
            <AnalyticsView lang={lang} />
          )}

          {/* ─────── Migration Wizard View ─────── */}
          {mode === 'migrate' && (
            <div className={styles.migrateBody}>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsTitle}>{ui('migrationTitle')}</h3>
                <p className={styles.settingsDescription}>
                  {migrationFlow === 'upgrade' ? ui('migrationUpgradeDescription') : ui('migrationDescription')}
                </p>
              </div>

              <div className={styles.migrationModeToggle}>
                <button
                  className={`${styles.migrationModeBtn} ${migrationFlow === 'api' ? styles.migrationModeBtnActive : ''}`}
                  onClick={() => {
                    setMigrationFlow('api');
                    setShowVersionTable(false);
                    setMigrateApiError('');
                  }}
                  disabled={migrateLoading}
                >
                  {ui('migrationModeApi')}
                </button>
                <button
                  className={`${styles.migrationModeBtn} ${migrationFlow === 'upgrade' ? styles.migrationModeBtnActive : ''}`}
                  onClick={() => {
                    setMigrationFlow('upgrade');
                    setShowVersionTable(false);
                    setMigrateUpgradeError('');
                  }}
                  disabled={migrateLoading}
                >
                  {ui('migrationModeUpgrade')}
                </button>
              </div>

              {migrationFlow === 'upgrade' && (
                <div className={styles.migrationUpgradeConfig}>
                  <div className={styles.selectorGroup}>
                    <label className={styles.modelSelectorLabel} htmlFor="upgrade-from-version">{ui('fromVersion')}</label>
                    <select
                      id="upgrade-from-version"
                      className={styles.selectorSelect}
                      value={upgradeFromVersion}
                      onChange={(e) => {
                        setUpgradeFromVersion(e.target.value);
                        setMigrateUpgradeError('');
                      }}
                      disabled={migrateLoading}
                    >
                      {IX_VERSIONS.map((version) => (
                        <option key={version.id} value={version.id}>{version.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.selectorGroup}>
                    <label className={styles.modelSelectorLabel} htmlFor="upgrade-to-version">{ui('toVersion')}</label>
                    <select
                      id="upgrade-to-version"
                      className={styles.selectorSelect}
                      value={upgradeToVersion}
                      onChange={(e) => {
                        setUpgradeToVersion(e.target.value);
                        setMigrateUpgradeError('');
                      }}
                      disabled={migrateLoading}
                    >
                      {IX_VERSIONS.map((version) => (
                        <option key={version.id} value={version.id}>{version.id}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {migrationFlow === 'upgrade' && (
                <div className={styles.migrationVersionToggle}>
                  <button
                    className={styles.settingsLinkBtn}
                    onClick={() => setShowVersionTable((prev) => !prev)}
                    type="button"
                    aria-expanded={showVersionTable}
                  >
                    {showVersionTable ? ui('hideVersionTable') : ui('showVersionTable')}
                  </button>
                </div>
              )}

              {migrationFlow === 'upgrade' && showVersionTable && (
                <div className={styles.migrationVersionTableWrap}>
                  <table className={styles.tierTable}>
                    <thead>
                      <tr>
                        <th>{ui('version')}</th>
                        <th>{ui('versionStatus')}</th>
                        <th>{ui('released')}</th>
                        <th>{ui('maintenanceSince')}</th>
                        <th>{ui('eolSince')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {IX_VERSIONS.map((version) => (
                        <tr key={version.id}>
                          <td>{version.id}</td>
                          <td>{version.status === 'latest' ? ui('latest') : version.status === 'maintenance' ? ui('maintenance') : ui('endOfLife')}</td>
                          <td>{version.released}</td>
                          <td>{version.maintenanceSince || ui('notApplicable')}</td>
                          <td>{version.eolSince || ui('notApplicable')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {migrationFlow === 'upgrade' && IX_VERSIONS.find((v) => v.id === upgradeFromVersion)?.status === 'eol' && (
                <div className={styles.info}>
                  {ui('upgradeFromEolWarning', { version: upgradeFromVersion })}
                </div>
              )}

              {migrationFlow === 'upgrade' && upgradeFromVersion === 'V2.0.0' && (
                <div className={styles.info}>
                  {ui('upgradePathHint')}
                </div>
              )}

              <div className={styles.section}>
                <label className={styles.label}>{ui('yourExistingCode')}</label>
                <textarea
                  className={styles.textarea}
                  placeholder={migrationFlow === 'upgrade' ? ui('migrationUpgradePlaceholder') : ui('migrationPlaceholder')}
                  value={activeMigrateInput}
                  onChange={(e) => setActiveMigrateInput(e.target.value)}
                  rows={7}
                  disabled={migrateLoading}
                />
              </div>

              <button
                className={styles.generateBtn}
                onClick={handleMigrate}
                disabled={
                  migrateLoading ||
                  !activeMigrateInput.trim() ||
                  (migrationFlow === 'upgrade' &&
                    ((IX_VERSION_ORDER[upgradeToVersion] || 0) <= (IX_VERSION_ORDER[upgradeFromVersion] || 0)))
                }
              >
                {migrateLoading ? <span className={styles.spinner} /> : '🔍'}{' '}
                {migrateLoading ? ui('analyzing') : migrationFlow === 'upgrade' ? ui('analyzeAndUpgrade') : ui('analyzeAndMigrate')}
              </button>

              {!hasPremium && !migrateLoading && !activeMigrateOutput && (
                <div className={styles.info}>
                  {ui('migrationRequiresApiKey')}
                  <button className={styles.settingsLinkBtn} onClick={() => setMode('settings')} style={{ marginLeft: 6 }}>
                    {ui('settingsArrow')}
                  </button>
                </div>
              )}

              {activeMigrateError && (
                <div className={styles.error}>
                  ⚠️ {activeMigrateError}
                  <button className={styles.errorClose} onClick={() => setActiveMigrateError('')}>✕</button>
                </div>
              )}

              {activeMigrateSummary && (
                <div className={styles.migrateSummary}>
                  <strong>📋 {ui('summary')}</strong> {activeMigrateSummary}
                </div>
              )}

              {activeMigrateOutput && (
                <>
                  <div className={styles.section}>
                    <label className={styles.label}>{ui('diff')}</label>
                    <div className={styles.diffBlock}>
                      {computeDiff(activeMigrateSourceInput, activeMigrateOutput).map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.type === 'added'
                              ? styles.diffAdded
                              : line.type === 'removed'
                              ? styles.diffRemoved
                              : styles.diffUnchanged
                          }
                        >
                          <span className={styles.diffGutter}>
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '\u2212' : ' '}
                          </span>
                          <code>{line.text}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.section}>
                    <div className={styles.codeHeader}>
                      <label className={styles.label}>{ui('migratedCode')}</label>
                      <div className={styles.codeActions}>
                        <button
                          className={styles.downloadBtn}
                          onClick={handleMigrateDownload}
                          title={ui('download')}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                            <path d="M8 2v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                            <path d="M5.25 6.75L8 9.5l2.75-2.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                          </svg>
                          {ui('download')}
                        </button>
                        <button
                          className={styles.copyBtn}
                          onClick={() => handleMigrateCopy(stripCodeFence(activeMigrateOutput))}
                          title={ui('copy')}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                            <rect x="5" y="1" width="9" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <rect x="2" y="4" width="9" height="11" rx="2" fill="var(--theme-color-primary,#00bde3)" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                          {ui('copy')}
                        </button>
                      </div>
                    </div>
                    <pre className={styles.codeBlock}>
                      <code>{stripCodeFence(activeMigrateOutput)}</code>
                    </pre>
                    <div className={styles.feedbackBox}>
                      <div className={styles.feedbackRow}>
                        <span className={styles.feedbackTitle}>{ui('feedbackTitle')}</span>
                        <button
                          className={`${styles.feedbackBtn} ${activeMigrateFeedback.rating === 'up' ? styles.feedbackBtnActive : ''}`}
                          onClick={() => submitMigrateRating('up')}
                          disabled={activeMigrateFeedback.submitted || activeMigrateFeedback.submitting}
                          title={ui('thumbsUp')}
                        >
                          {ui('thumbsUp')}
                        </button>
                        <button
                          className={`${styles.feedbackBtn} ${activeMigrateFeedback.rating === 'down' ? styles.feedbackBtnActive : ''}`}
                          onClick={() => submitMigrateRating('down')}
                          disabled={activeMigrateFeedback.submitted || activeMigrateFeedback.submitting}
                          title={ui('thumbsDown')}
                        >
                          {ui('thumbsDown')}
                        </button>
                      </div>
                      {activeMigrateFeedback.showCorrection && !activeMigrateFeedback.submitted && (
                        <div className={styles.feedbackCorrectionRow}>
                          <input
                            className={styles.feedbackInput}
                            type="text"
                            value={activeMigrateFeedback.correction}
                            placeholder={ui('feedbackCorrectionPlaceholder')}
                            onChange={(e) => setActiveMigrateFeedback((prev) => ({ ...prev, correction: e.target.value }))}
                            disabled={activeMigrateFeedback.submitting}
                          />
                          <button
                            className={styles.feedbackSubmitBtn}
                            onClick={submitMigrateCorrection}
                            disabled={activeMigrateFeedback.submitting}
                          >
                            {activeMigrateFeedback.submitting ? ui('sendingFeedback') : ui('submitFeedback')}
                          </button>
                        </div>
                      )}
                      {activeMigrateFeedback.submitted && <div className={styles.feedbackThanks}>{ui('feedbackThanks')}</div>}
                      {activeMigrateFeedback.error && <div className={styles.feedbackError}>⚠️ {activeMigrateFeedback.error}</div>}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
