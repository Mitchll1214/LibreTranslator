import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './styles.css';

const sourceLanguages = ['AUTO', 'ZH', 'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK'];

const targetLanguages = ['ZH', 'ZH-HANS', 'ZH-HANT', 'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL', 'PT', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK'];

/* 内联 SVG 图标（Lucide 风格，stroke=currentColor，跟随主题色）
 * 避免用 emoji 作功能图标（跨平台样式不一致） */
const Icon = ({ name, size = 16, className = '' }) => {
    const paths = {
        history: <><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></>,
        speaker: <><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>,
        x: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
        swap: <><path d="M17 1l4 4-4 4" /><path d="M3 5h18" /><path d="M7 23l-4-4 4-4" /><path d="M21 19H3" /></>,
        translate: <><path d="M4 5h7" /><path d="M9 3v2c0 4.97-1 8-4 10" /><path d="M5 9c0 4 2 7 6 9" /><path d="M14 5l5 14" /><path d="M12 11h7" /></>,
    };
    return (
        <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true" focusable="false">
            {paths[name]}
        </svg>
    );
};

const App = () => {
    const { t, i18n } = useTranslation();
    const [text, setText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [sourceLang, setSourceLang] = useState('AUTO');
    const [targetLang, setTargetLang] = useState('ZH');
    const [inputCharCount, setInputCharCount] = useState(0);
    const [outputCharCount, setOutputCharCount] = useState(0);
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [autoTranslate, setAutoTranslate] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState([]);
    // 点词查译：{ word: 源词, target: 单译结果 }
    const [wordLookup, setWordLookup] = useState(null);
    const wordTimerRef = useRef(null);
    const wordLookupRef = useRef(null);
    const [detectedLanguage, setDetectedLanguage] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const translateTimerRef = useRef(null);
    
    const inputRef = useRef(null);
    const outputRef = useRef(null);

    useEffect(() => {
        if (!process.env.REACT_APP_PASSWORD) {
            setIsAuthenticated(true);
        }
        
        // Load translation history from localStorage
        const savedHistory = localStorage.getItem('translationHistory');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Failed to parse history:', e);
                localStorage.removeItem('translationHistory');
            }
        }
    }, []);

    useEffect(() => {
        // Save history to localStorage whenever it changes
        localStorage.setItem('translationHistory', JSON.stringify(history));
    }, [history]);

    const saveToHistory = (sourceText, translatedText, sourceLang, targetLang, detectedLang) => {
        if (!sourceText.trim() || !translatedText.trim()) return;
        
        const newHistoryItem = {
            id: Date.now(),
            sourceText: sourceText,
            translatedText: translatedText,
            sourceLang: sourceLang === 'AUTO' ? (detectedLang || 'AUTO') : sourceLang,
            targetLang: targetLang,
            timestamp: new Date().toISOString()
        };
        
        setHistory(prev => [newHistoryItem, ...prev].slice(0, 50)); // Keep only the last 50 items
    };

    /* 公共翻译请求：整段与点词复用同一套 fetch + 解析逻辑 */
    const translateText = useCallback(async (inputText, srcLang, tgtLang) => {
        const body = { text: inputText, target_lang: tgtLang };
        if (srcLang && srcLang !== 'AUTO') {
            body.source_lang = srcLang;
        }

        const headers = { 'Content-Type': 'application/json' };
        if (password) {
            headers['X-Auth-Password'] = password;
        }

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const rawText = await response.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseError) {
            // 保留原始响应片段便于诊断，交由调用方处理
            throw new Error('non-json:' + rawText.slice(0, 200));
        }
        return data;
    }, [password]);

    const handleTranslate = useCallback(async () => {
        if (!text.trim()) return;
        setLoading(true);
        try {
            const data = await translateText(text, sourceLang, targetLang);

            if (data.code === 200) {
                setTranslatedText(data.data);
                setOutputCharCount(data.data.length);
                setMessage(t('translationSuccess'));
                setIsError(false);
                
                // If language was auto-detected, store the detected language
                if (sourceLang === 'AUTO' && data.detected_language) {
                    setDetectedLanguage(data.detected_language);
                    saveToHistory(text, data.data, sourceLang, targetLang, data.detected_language);
                } else {
                    saveToHistory(text, data.data, sourceLang, targetLang);
                }
            } else {
                // 显示服务器返回的具体错误信息（含诊断片段），便于定位
                const errMsg = data.snippet ? `${data.message} ${data.snippet}` : data.message;
                setMessage(errMsg || t('translationFailed'));
                setIsError(true);
            }

            setTimeout(() => {
                setMessage('');
            }, 3000);
        } catch (error) {
            console.error('翻译请求错误:', error);
            setMessage(t('translationError'));
            setIsError(true);
            setTimeout(() => {
                setMessage('');
            }, 3000);
        } finally {
            setLoading(false);
        }
    }, [text, targetLang, sourceLang, t, password]);

    useEffect(() => {
        if (autoTranslate && !isComposing && text.trim()) {
            clearTimeout(translateTimerRef.current);
            translateTimerRef.current = setTimeout(() => {
                handleTranslate();
            }, 700);  // 固定防抖延迟
        }
        return () => clearTimeout(translateTimerRef.current);
    }, [text, autoTranslate, isComposing, handleTranslate]);

    const handleTextChange = (e) => {
        setText(e.target.value);
        setInputCharCount(e.target.value.length);
        // 文本变化时清除旧的点词释义与未决请求，并失效同词守卫
        clearTimeout(wordTimerRef.current);
        setWordLookup(null);
        wordLookupRef.current = null;
    };

    /* textarea 自适应高度：内容增长时自动变高 */
    const autoResize = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    };

    /* 光标所在单词提取 + 防抖单译 */
    const handleWordSelect = (e) => {
        const el = e.target;
        const start = el.selectionStart;
        const value = el.value || '';
        if (!value.trim() || start === null) return;
        /* 向前后扩展取当前词（空格/标点分隔） */
        const before = value.slice(0, start);
        const after = value.slice(start);
        const leftMatch = before.match(/[\w\u00C0-\u024F\u4e00-\u9FFF]+$/);
        const rightMatch = after.match(/^[\w\u00C0-\u024F\u4e00-\u9FFF]+/);
        const word = (leftMatch ? leftMatch[0] : '') + (rightMatch ? rightMatch[0] : '');
        if (!word) return;

        clearTimeout(wordTimerRef.current);
        /* 同一词重复选中不重复请求 */
        if (wordLookupRef.current === word) return;
        wordTimerRef.current = setTimeout(async () => {
            try {
                const data = await translateText(word, sourceLang, targetLang);
                if (data && data.code === 200) {
                    wordLookupRef.current = word;
                    setWordLookup({ word, target: data.data });
                }
            } catch (err) {
                /* 静默失败，不打扰用户 */
            }
        }, 400);
    };

    const handleComposition = (e) => {
        if (e.type === 'compositionstart') {
            setIsComposing(true);
        } else if (e.type === 'compositionend') {
            // 结束 IME 编辑后，更新 state 为最终确认文本
            setIsComposing(false);
            const confirmedText = e.target.value;
            setText(confirmedText);
            setInputCharCount(confirmedText.length);
        }
    };

    const handleKeyDown = (e) => {
        // Ctrl+Enter 触发手动翻译
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            clearTimeout(translateTimerRef.current);
            handleTranslate();
        }
    };

    /* 内容变化（输入/翻译/交换/历史载入/清空）后同步自适应高度 */
    useEffect(() => {
        autoResize(inputRef.current);
        autoResize(outputRef.current);
    }, [text, translatedText]);

    /* 卸载时清理点词防抖定时器 */
    useEffect(() => () => clearTimeout(wordTimerRef.current), []);

    useEffect(() => {
        // 首先尝试从localStorage获取用户之前选择的语言
        const savedLanguage = localStorage.getItem('uiLanguage');
        
        if (savedLanguage && ['zh', 'de', 'en'].includes(savedLanguage)) {
            i18n.changeLanguage(savedLanguage);
        } else {
            // 如果没有保存的语言，则从浏览器设置中检测
            const userLang = navigator.language || navigator.userLanguage;
            let detectedLang = 'en'; // 默认为英语
            
            // 处理常见的中文变体
            if (userLang.startsWith('zh')) {
                detectedLang = 'zh';
            } 
            // 处理常见的德语变体
            else if (userLang.startsWith('de')) {
                detectedLang = 'de';
            }
            // 处理常见的英语变体
            else if (userLang.startsWith('en')) {
                detectedLang = 'en';
            }
            
            i18n.changeLanguage(detectedLang);
            // 保存检测到的语言
            localStorage.setItem('uiLanguage', detectedLang);
        }
    }, [i18n]);

    useEffect(() => {
        // 在输入框失焦时进行最终翻译
        const handleBlur = () => {
            if (autoTranslate) {
                clearTimeout(translateTimerRef.current);
                handleTranslate();
            }
        };
        
        // 输入框获得焦点时的处理
        const handleFocus = () => {
            // 可以在这里添加其他逻辑
        };
        
        // 添加事件监听
        const inputElement = inputRef.current;
        if (inputElement) {
            inputElement.addEventListener('blur', handleBlur);
            inputElement.addEventListener('focus', handleFocus);
        }
        
        return () => {
            // 清除事件监听
            if (inputElement) {
                inputElement.removeEventListener('blur', handleBlur);
                inputElement.removeEventListener('focus', handleFocus);
            }
        };
    }, [autoTranslate, inputRef, handleTranslate]);

    const handleOutputChange = (e) => {
        setTranslatedText(e.target.value);
        setOutputCharCount(e.target.value.length);
    };

    const handleCopy = (textToCopy) => {
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                setMessage(t('copySuccess'));
                setIsError(false);
            })
            .catch(() => {
                setMessage(t('copyFailed'));
                setIsError(true);
            });

        setTimeout(() => {
            setMessage('');
        }, 2000);
    };
    
    const handleSpeak = (text, lang) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Set the language - simplify the language code if needed
            let langCode = lang;
            if (langCode.includes('-')) {
                // For languages like ZH-HANS, use just the first part
                langCode = langCode.split('-')[0].toLowerCase();
            } else {
                langCode = langCode.toLowerCase();
            }
            
            utterance.lang = langCode;
            speechSynthesis.speak(utterance);
        }
    };

    const handleSwapLanguages = () => {
        if (sourceLang !== 'AUTO' && targetLang !== 'AUTO') {
            const tempLang = sourceLang;
            setSourceLang(targetLang);
            setTargetLang(tempLang);
            
            // Also swap the text
            setTranslatedText(text);
            setText(translatedText);
            setInputCharCount(translatedText.length);
            setOutputCharCount(text.length);
        }
    };

    const handlePasswordSubmit = () => {
        if (!process.env.REACT_APP_PASSWORD || password === process.env.REACT_APP_PASSWORD) {
            setIsAuthenticated(true);
        } else {
            setMessage(t('wrongPassword'));
            setIsError(true);
            setTimeout(() => {
                setMessage('');
            }, 2000);
        }
    };

    const changeLanguage = (event) => {
        const newLang = event.target.value;
        i18n.changeLanguage(newLang);
        localStorage.setItem('uiLanguage', newLang);
    };
    
    const loadFromHistory = (item) => {
        setText(item.sourceText);
        setTranslatedText(item.translatedText);
        setInputCharCount(item.sourceText.length);
        setOutputCharCount(item.translatedText.length);
        setSourceLang(item.sourceLang === 'AUTO' ? 'AUTO' : item.sourceLang);
        setTargetLang(item.targetLang);
        setHistoryOpen(false);
    };
    
    const clearHistory = () => {
        if (window.confirm(t('clearHistoryConfirm'))) {
            setHistory([]);
            localStorage.removeItem('translationHistory');
        }
    };
    
    const clearText = (field) => {
        if (field === 'input') {
            setText('');
            setInputCharCount(0);
        } else {
            setTranslatedText('');
            setOutputCharCount(0);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="password-container">
                <h1>Mitchll LibreTranslator</h1>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('enterPassword')}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                />
                <button onClick={handlePasswordSubmit}>{t('submit')}</button>
                {message && (
                    <div className={`message ${isError ? 'error' : 'success'}`}>
                        {message}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="container">
            <div className="app-header">
                <h1 className="app-title">
                    <span className="app-title-mark" aria-hidden="true"><Icon name="swap" size={20} /></span>
                    <span>Mitchll LibreTranslator</span>
                </h1>
                <div className="app-controls">
                    <div className="language-switcher">
                        <label>Lang:</label>
                        <select onChange={changeLanguage} value={i18n.language}>
                            <option value="en">English</option>
                            <option value="zh">中文</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </div>
                    <div className="auto-translate">
                        <label>
                            <input
                                type="checkbox"
                                checked={autoTranslate}
                                onChange={(e) => setAutoTranslate(e.target.checked)}
                            />
                            {t('autoTranslate')}
                        </label>
                    </div>
                </div>
            </div>
            
            <div className="features-bar">
                <button 
                    className="feature-button" 
                    onClick={() => setHistoryOpen(true)}
                    title={t('history')}
                >
                    <span className="feature-icon"><Icon name="history" /></span> {t('history')}
                </button>
                {/* Additional feature buttons could be added here */}
            </div>
            
            <div className="workspace">
                <div className="language-selection">
                    <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                    {sourceLanguages.map(langCode => (
                        <option key={langCode} value={langCode}>
                            {langCode === 'AUTO' ? t('sourceLanguages.AUTO') : t(`sourceLanguages.${langCode}`)}
                        </option>
                    ))}
                </select>
                <button onClick={handleSwapLanguages} className="swap-button" title={t('swapLanguages')} aria-label={t('swapLanguages')}><Icon name="swap" size={18} /></button>
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                    {targetLanguages.map(langCode => (
                        <option key={langCode} value={langCode}>
                            {t(`targetLanguages.${langCode}`)}
                        </option>
                    ))}
                </select>
            </div>
            
            <div className="text-areas">
                <div className="textarea-container">
                    <div className="textarea-header">
                        <div className="textarea-header-language">
                            {sourceLang === 'AUTO' ? t('sourceLanguages.AUTO') : t(`sourceLanguages.${sourceLang}`)}
                            {sourceLang === 'AUTO' && detectedLanguage && ` (${t(`sourceLanguages.${detectedLanguage}`)})` }
                        </div>
                        <div className="textarea-actions">
                            {autoTranslate && (
                                <div className="translation-pending-indicator" title={t('translating')}>⋯</div>
                            )}
                            <button 
                                className="action-button" 
                                onClick={() => handleSpeak(text, detectedLanguage || sourceLang)}
                                title={t('speak')}
                                aria-label={t('speak')}
                                disabled={!text.trim()}
                            >
                                <Icon name="speaker" size={15} />
                            </button>
                            <button 
                                className="action-button" 
                                onClick={() => clearText('input')} 
                                title={t('clearText')}
                                aria-label={t('clearText')}
                                disabled={!text.trim()}
                            >
                                <Icon name="x" size={15} />
                            </button>
                        </div>
                    </div>
                    <textarea
                        ref={inputRef}
                        value={text}
                        onChange={handleTextChange}
                        onInput={(e) => autoResize(e.target)}
                        onCompositionStart={handleComposition}
                        onCompositionEnd={handleComposition}
                        onKeyDown={handleKeyDown}
                        onSelect={handleWordSelect}
                        placeholder={t('inputPlaceholder')}
                    />
                    <div className="info-bar">
                        <div className="char-count">{t('charCount')}: {inputCharCount}</div>
                        <button 
                            onClick={() => handleCopy(text)} 
                            className="copy-button" 
                            disabled={!text.trim()}
                        >
                            {t('copy')}
                        </button>
                    </div>
                </div>
                
                <div className="textarea-container">
                    <div className="textarea-header">
                        <div className="textarea-header-language">
                            {t(`targetLanguages.${targetLang}`)}
                        </div>
                        <div className="textarea-actions">
                            <button 
                                className="action-button" 
                                onClick={() => handleSpeak(translatedText, targetLang)}
                                title={t('speak')}
                                aria-label={t('speak')}
                                disabled={!translatedText.trim()}
                            >
                                <Icon name="speaker" size={15} />
                            </button>
                            <button 
                                className="action-button" 
                                onClick={() => clearText('output')}
                                title={t('clearText')}
                                aria-label={t('clearText')}
                                disabled={!translatedText.trim()}
                            >
                                <Icon name="x" size={15} />
                            </button>
                        </div>
                    </div>
                    {wordLookup && (
                        <div className="word-lookup" role="status" aria-live="polite">
                            <span className="word-lookup-word">{wordLookup.word}</span>
                            <span className="word-lookup-caret" aria-hidden="true">→</span>
                            <span className="word-lookup-target">{wordLookup.target}</span>
                            <button
                                className="word-lookup-close"
                                onClick={() => setWordLookup(null)}
                                aria-label={t('clearText')}
                            ><Icon name="x" size={12} /></button>
                        </div>
                    )}
                    <textarea
                        ref={outputRef}
                        value={translatedText}
                        onChange={handleOutputChange}
                        onInput={(e) => autoResize(e.target)}
                        placeholder={t('outputPlaceholder')}
                    />
                    <div className="info-bar">
                        <div className="char-count">{t('charCount')}: {outputCharCount}</div>
                        <button 
                            onClick={() => handleCopy(translatedText)} 
                            className="copy-button"
                            disabled={!translatedText.trim()}
                        >
                            {t('copy')}
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="translate-wrap">
                <button 
                    onClick={handleTranslate} 
                    disabled={loading || !text.trim()} 
                    className="translate-button"
                >
                    <span className="translate-button-icon"><Icon name="translate" size={17} /></span>
                    {loading ? t('translating') : t('translate')}
                </button>
            </div>
            </div>{/* workspace */}
            
            {message && (
                <div className={`message ${isError ? 'error' : 'success'}`}>
                    {message}
                </div>
            )}
            
            <footer className="footer">
                <span className="footer-copyright">© {new Date().getFullYear()} Mitchll LibreTranslator</span>
                <span className="footer-sep" aria-hidden="true">·</span>
                <a href="https://github.com/Mitchll1214/LibreTranslator" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
            </footer>
            
            {/* History Panel */}
            <div className={`history-panel ${historyOpen ? 'open' : ''}`}>
                <div className="history-header">
                    <h2 className="history-title">{t('history')}</h2>
                    <button className="close-history" onClick={() => setHistoryOpen(false)}>×</button>
                </div>
                <div className="history-items">
                    {history.length > 0 ? (
                        <>
                            {history.map(item => (
                                <div 
                                    key={item.id} 
                                    className="history-item" 
                                    onClick={() => loadFromHistory(item)}
                                >
                                    <div className="history-item-text">{item.sourceText}</div>
                                    <div className="history-item-translation">{item.translatedText}</div>
                                    <div className="history-item-langs">
                                        {item.sourceLang === 'AUTO' ? t('sourceLanguages.AUTO') : t(`sourceLanguages.${item.sourceLang}`)} → {t(`targetLanguages.${item.targetLang}`)}
                                    </div>
                                </div>
                            ))}
                            <button className="clear-history" onClick={clearHistory}>
                                {t('clearHistory')}
                            </button>
                        </>
                    ) : (
                        <div className="history-empty">
                            {t('noHistory')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
