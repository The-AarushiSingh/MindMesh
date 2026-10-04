import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { apiRequest } from './api';
import PasswordField from './PasswordField';

const navItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'ask', label: 'Ask' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'gaps', label: 'Gaps' },
];

const readToken = () => localStorage.getItem('mindmesh-token');

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const statusLabel = {
  saved: 'Waiting',
  processing: 'Processing',
  processed: 'Processed',
  failed: 'Failed',
};

const modeLabel = {
  embedding: 'Semantic similarity',
  'lexical-fallback': 'Keyword overlap',
  none: 'No matching knowledge',
};

const sourceLabel = {
  provider: 'AI provider',
  heuristic: 'Heuristic fallback',
  unavailable: 'Not analyzed',
};

function App() {
  const [token, setToken] = useState(readToken());
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [emailDelivery, setEmailDelivery] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [saveMode, setSaveMode] = useState('url');
  const [resourceForm, setResourceForm] = useState({ title: '', url: '', description: '', content: '' });
  const [resourceError, setResourceError] = useState('');
  const [resources, setResources] = useState([]);
  const [resourcePage, setResourcePage] = useState({ page: 1, hasMore: false, total: 0 });
  const [selectedResource, setSelectedResource] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState({ status: 'idle', results: [], mode: '', error: '' });
  const [askQuestion, setAskQuestion] = useState('');
  const [askResult, setAskResult] = useState(null);
  const [askError, setAskError] = useState('');
  const [overview, setOverview] = useState(null);
  const [graph, setGraph] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [pageError, setPageError] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  const hasPendingWork = resources.some((resource) => resource.status === 'saved' || resource.status === 'processing');

  const loadResources = useCallback(async (currentToken = token, page = 1) => {
    const data = await apiRequest(`/resources?page=${page}&limit=20`, {}, currentToken);
    setResources((current) => (page === 1 ? data.resources || [] : [...current, ...(data.resources || [])]));
    setResourcePage({ page, hasMore: Boolean(data.hasMore), total: data.total || 0 });
  }, [token]);

  const loadKnowledge = useCallback(async (currentToken = token) => {
    const [overviewData, graphData, gapData, healthData] = await Promise.all([
      apiRequest('/knowledge/overview', {}, currentToken),
      apiRequest('/knowledge/graph', {}, currentToken),
      apiRequest('/knowledge/gaps', {}, currentToken),
      apiRequest('/health'),
    ]);
    setOverview(overviewData.overview);
    setGraph(graphData.graph);
    setGaps(gapData.gaps || []);
    setCapabilities(healthData);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    localStorage.setItem('mindmesh-token', token);
    let cancelled = false;

    apiRequest('/auth/me', {}, token)
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem('mindmesh-token');
        if (!cancelled) setToken(null);
      });

    apiRequest('/resources?page=1&limit=20', {}, token)
      .then((data) => {
        if (cancelled) return;
        setResources(data.resources || []);
        setResourcePage({ page: 1, hasMore: Boolean(data.hasMore), total: data.total || 0 });
      })
      .catch((error) => {
        if (!cancelled) setPageError(error.message);
      });

    Promise.all([
      apiRequest('/knowledge/overview', {}, token),
      apiRequest('/knowledge/graph', {}, token),
      apiRequest('/knowledge/gaps', {}, token),
      apiRequest('/health'),
    ]).then(([overviewData, graphData, gapData, healthData]) => {
      if (cancelled) return;
      setOverview(overviewData.overview);
      setGraph(graphData.graph);
      setGaps(gapData.gaps || []);
      setCapabilities(healthData);
    }).catch((error) => {
      if (!cancelled) setPageError(error.message);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !hasPendingWork) return undefined;

    const timer = setInterval(() => {
      loadResources(token).catch(() => {});
      loadKnowledge(token).catch(() => {});
      if (selectedResource?._id) {
        apiRequest(`/resources/${selectedResource._id}`, {}, token)
          .then((data) => setSelectedResource(data.resource))
          .catch(() => {});
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [token, hasPendingWork, selectedResource?._id, loadResources, loadKnowledge]);

  useEffect(() => {
    if (authMode !== 'verify') return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [authMode]);

  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - clock) / 1000));

  const openVerification = ({ email, delivery, code, cooldownSeconds = 60 }) => {
    setVerificationEmail(email);
    setEmailDelivery(delivery || '');
    setDevCode(code || '');
    setVerificationCode(code || '');
    setResendAvailableAt(cooldownSeconds > 0 ? Date.now() + cooldownSeconds * 1000 : 0);
    setAuthMode('verify');
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setPendingAction('auth');

    try {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const payload = authMode === 'register'
        ? authForm
        : { email: authForm.email, password: authForm.password };
      const data = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(payload) });

      if (authMode === 'login') {
        setToken(data.token);
      } else {
        const email = authForm.email.trim().toLowerCase();
        setAuthForm({ name: '', email, password: '' });
        openVerification({
          email,
          delivery: data.emailDelivery,
          code: data.devCode,
          cooldownSeconds: 60,
        });
        setAuthError(data.emailDelivery === 'failed' ? data.message : '');
        setAuthMessage(data.emailDelivery === 'failed' ? '' : data.message);
      }
    } catch (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        openVerification({
          email: authForm.email.trim().toLowerCase(),
          delivery: '',
          code: '',
          cooldownSeconds: 0,
        });
        setAuthError(error.message);
        setAuthMessage('');
      } else {
        setAuthError(error.message);
      }
    } finally {
      setPendingAction('');
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setAuthError('');
    setPendingAction('verify');

    try {
      const data = await apiRequest('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ email: verificationEmail, code: verificationCode }),
      });
      setAuthMode('login');
      setAuthForm((current) => ({ ...current, email: verificationEmail, password: '' }));
      setAuthMessage(data.message || 'Email verified. You can log in.');
      setDevCode('');
      setVerificationCode('');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleResend = async () => {
    setAuthError('');
    setPendingAction('resend');

    try {
      const data = await apiRequest('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: verificationEmail }),
      });
      if (data.alreadyVerified) {
        setAuthMode('login');
        setAuthMessage(data.message);
        return;
      }
      setEmailDelivery(data.emailDelivery || '');
      setDevCode(data.devCode || '');
      setVerificationCode(data.devCode || '');
      setResendAvailableAt(Date.now() + 60 * 1000);
      setAuthMessage(data.message);
      setAuthError(data.emailDelivery === 'failed' ? data.message : '');
    } catch (error) {
      const retryAfter = error.payload?.retryAfterSeconds;
      if (retryAfter) setResendAvailableAt(Date.now() + retryAfter * 1000);
      setAuthError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleResourceSubmit = async (event) => {
    event.preventDefault();
    setResourceError('');
    setPendingAction('save');

    try {
      const payload = saveMode === 'note'
        ? { type: 'note', title: resourceForm.title, content: resourceForm.content, description: resourceForm.description }
        : { title: resourceForm.title, url: resourceForm.url, description: resourceForm.description };

      await apiRequest('/resources', { method: 'POST', body: JSON.stringify(payload) }, token);
      setResourceForm({ title: '', url: '', description: '', content: '' });
      await loadResources(token);
      await loadKnowledge(token);
    } catch (error) {
      setResourceError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const openResource = async (resourceId) => {
    setPageError('');
    setPendingAction('detail');
    try {
      const data = await apiRequest(`/resources/${resourceId}`, {}, token);
      setSelectedResource(data.resource);
      setActiveSection('detail');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleRetry = async (resourceId) => {
    setPendingAction(`retry:${resourceId}`);
    try {
      await apiRequest(`/resources/${resourceId}/retry`, { method: 'POST' }, token);
      await loadResources(token);
      if (selectedResource?._id === resourceId) {
        const data = await apiRequest(`/resources/${resourceId}`, {}, token);
        setSelectedResource(data.resource);
      }
    } catch (error) {
      setPageError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleDelete = async (resourceId) => {
    setPendingAction(`delete:${resourceId}`);
    try {
      await apiRequest(`/resources/${resourceId}`, { method: 'DELETE' }, token);
      if (selectedResource?._id === resourceId) {
        setSelectedResource(null);
        setActiveSection('library');
      }
      await loadResources(token);
      await loadKnowledge(token);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;
    setPendingAction('search');
    setSearchState((current) => ({ ...current, error: '' }));

    try {
      const data = await apiRequest(`/search?q=${encodeURIComponent(searchQuery)}`, {}, token);
      setSearchState({ status: 'done', results: data.results || [], mode: data.mode, error: '' });
    } catch (error) {
      setSearchState({ status: 'done', results: [], mode: '', error: error.message });
    } finally {
      setPendingAction('');
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!askQuestion.trim()) return;
    setPendingAction('ask');
    setAskError('');

    try {
      const data = await apiRequest('/brain/ask', {
        method: 'POST',
        body: JSON.stringify({ question: askQuestion }),
      }, token);
      setAskResult(data);
    } catch (error) {
      setAskResult(null);
      setAskError(error.message);
    } finally {
      setPendingAction('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mindmesh-token');
    setToken(null);
    setUser(null);
    setResources([]);
    setOverview(null);
    setGraph(null);
    setGaps([]);
    setSelectedResource(null);
    setActiveSection('overview');
  };

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-header">
            <p className="eyebrow">MindMesh</p>
            <h1>Personal knowledge archive</h1>
            <p className="lede">Save something you read. MindMesh extracts the ideas, connects them, and answers from that archive.</p>
          </div>
          {authMode !== 'verify' && (
            <div className="auth-toggle">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); setAuthMessage(''); }}>Login</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); setAuthMessage(''); }}>Register</button>
            </div>
          )}
          {authMode === 'verify' ? (
            <form onSubmit={handleVerify} className="auth-form">
              <h2>Check your email</h2>
              <p className="lede">Enter the verification code we sent to {verificationEmail}.</p>
              {emailDelivery === 'development' && (
                <p className="notice">Development mode: no email was sent. Your code is {devCode}.</p>
              )}
              {emailDelivery === 'failed' && (
                <p className="form-error">The verification email could not be sent. Use resend to try again.</p>
              )}
              <label htmlFor="verification-code">
                Verification code
                <input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                />
              </label>
              {authMessage && <p className="hint">{authMessage}</p>}
              {authError && <p className="form-error">{authError}</p>}
              <button type="submit" className="primary-button" disabled={pendingAction === 'verify'}>Verify email</button>
              <button type="button" className="ghost-button" onClick={handleResend} disabled={pendingAction === 'resend' || resendSeconds > 0}>
                {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
              </button>
              <button type="button" className="ghost-button" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Back to login</button>
            </form>
          ) : (
          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'register' && (
              <label htmlFor="register-name">
                Name
                <input id="register-name" type="text" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="A. Reader" />
              </label>
            )}
            <label htmlFor="auth-email">
              Email
              <input id="auth-email" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="name@example.com" />
            </label>
            <PasswordField
              id="auth-password"
              label="Password"
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              placeholder="At least 8 characters"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
            />
            {authMode === 'register' && <p className="hint">Use uppercase, lowercase, a number, and a symbol.</p>}
            {authMessage && <p className="hint">{authMessage}</p>}
            {authError && <p className="form-error">{authError}</p>}
            <button type="submit" className="primary-button" disabled={pendingAction === 'auth'}>
              {authMode === 'login' ? 'Enter archive' : 'Create account'}
            </button>
          </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">MindMesh</p>
          <h2>Archive</h2>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={item.id === activeSection ? 'nav-item active' : 'nav-item'} onClick={() => setActiveSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-meta">
          <span className="meta-label">Signed in</span>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          {capabilities && (
            <span className="hint">
              Analysis: {sourceLabel[capabilities.analysis] || capabilities.analysis}. Retrieval: {modeLabel[capabilities.embeddings] || capabilities.embeddings}.
            </span>
          )}
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>Sign out</button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Knowledge system</p>
            <h1>MindMesh</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="ghost-button" onClick={() => setActiveSection('library')}>Library</button>
            <button type="button" className="primary-button" onClick={() => setActiveSection('library')}>Save resource</button>
          </div>
        </header>

        {pageError && <p className="form-error banner">{pageError}</p>}

        {activeSection === 'overview' && (
          <div className="content-stack">
            <section className="panel intro-panel">
              <p className="eyebrow">Overview</p>
              <h2>What you know, and what is still open</h2>
              <p className="lede">
                {overview
                  ? `You have ${overview.totalResources} saved resource${overview.totalResources === 1 ? '' : 's'}. ${overview.processingResources + overview.savedResources} are still being processed, and ${overview.failedResources} failed.`
                  : 'Loading your archive.'}
              </p>
              <div className="metrics-row">
                <div className="metric-box"><span className="metric-label">Saved</span><strong>{overview?.totalResources || 0}</strong></div>
                <div className="metric-box"><span className="metric-label">Processed</span><strong>{overview?.processedResources || 0}</strong></div>
                <div className="metric-box"><span className="metric-label">In progress</span><strong>{(overview?.savedResources || 0) + (overview?.processingResources || 0)}</strong></div>
                <div className="metric-box"><span className="metric-label">Failed</span><strong>{overview?.failedResources || 0}</strong></div>
              </div>
            </section>

            <section className="panel grid-two">
              <div>
                <p className="eyebrow">Recently added</p>
                <div className="list-stack">
                  {overview?.recentResources?.length ? overview.recentResources.map((resource) => (
                    <button key={resource.id} type="button" className="record-row as-button" onClick={() => openResource(resource.id)}>
                      <div>
                        <strong>{resource.title || 'Untitled resource'}</strong>
                        <p>{resource.summary || 'Summary will appear after processing.'}</p>
                      </div>
                      <span className={`meta-pill status-${resource.status}`}>{statusLabel[resource.status] || resource.status}</span>
                    </button>
                  )) : <p className="empty-note">Save an article, repository, or note to start the archive.</p>}
                </div>
              </div>
              <div>
                <p className="eyebrow">Coverage</p>
                {overview?.strongest?.length ? (
                  <ul className="detail-list">
                    {overview.strongest.map((item) => (
                      <li key={item.name}><span>{item.name}</span><strong>{item.band}</strong></li>
                    ))}
                  </ul>
                ) : <p className="empty-note">Coverage appears after a resource is processed.</p>}
                {overview?.nextRecommendation && (
                  <div className="notice">
                    <p className="eyebrow">Suggested next</p>
                    <strong>{overview.nextRecommendation.concept}</strong>
                    <p>{overview.nextRecommendation.recommendedNext}</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeSection === 'library' && (
          <div className="content-stack">
            <section className="panel form-panel">
              <p className="eyebrow">Save</p>
              <div className="auth-toggle compact-toggle">
                <button type="button" className={saveMode === 'url' ? 'active' : ''} onClick={() => setSaveMode('url')}>URL</button>
                <button type="button" className={saveMode === 'note' ? 'active' : ''} onClick={() => setSaveMode('note')}>Note</button>
              </div>
              <form onSubmit={handleResourceSubmit} className="resource-form">
                <label>
                  Title
                  <input type="text" value={resourceForm.title} onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })} placeholder="Optional title" />
                </label>
                {saveMode === 'url' ? (
                  <label>
                    URL
                    <input type="url" value={resourceForm.url} onChange={(event) => setResourceForm({ ...resourceForm, url: event.target.value })} placeholder="https://example.com/article" />
                  </label>
                ) : (
                  <label>
                    Note
                    <textarea rows="5" value={resourceForm.content} onChange={(event) => setResourceForm({ ...resourceForm, content: event.target.value })} placeholder="Write the idea you want to keep..." />
                  </label>
                )}
                <label>
                  Why it matters
                  <textarea rows="3" value={resourceForm.description} onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} placeholder="Optional context for your future self" />
                </label>
                {resourceError && <p className="form-error">{resourceError}</p>}
                <button type="submit" className="primary-button" disabled={pendingAction === 'save'}>
                  {pendingAction === 'save' ? 'Saving...' : 'Save resource'}
                </button>
              </form>
            </section>

            <section className="panel">
              <p className="eyebrow">Library · {resourcePage.total}</p>
              <div className="library-list">
                {resources.length ? resources.map((resource) => (
                  <article key={resource._id} className="library-item">
                    <div className="library-item-header">
                      <div>
                        <button type="button" className="text-button" onClick={() => openResource(resource._id)}>
                          <strong>{resource.title || 'Untitled resource'}</strong>
                        </button>
                        <span className="resource-type">{resource.type || 'article'}</span>
                      </div>
                      <span className={`meta-pill status-${resource.status}`}>{statusLabel[resource.status] || resource.status}</span>
                    </div>
                    {resource.url && <p className="resource-url">{resource.url}</p>}
                    <p className="resource-summary">{resource.summary || resource.description || 'Waiting for processing.'}</p>
                    {resource.error && <p className="form-error">{resource.error}</p>}
                    <div className="library-meta">
                      <span>{formatDate(resource.createdAt)}</span>
                      <span>{sourceLabel[resource.analysisSource] || 'Not analyzed'}</span>
                    </div>
                    <div className="row-actions">
                      {resource.status === 'failed' && (
                        <button type="button" className="ghost-button" onClick={() => handleRetry(resource._id)} disabled={pendingAction === `retry:${resource._id}`}>Retry</button>
                      )}
                      <button type="button" className="ghost-button" onClick={() => handleDelete(resource._id)} disabled={pendingAction === `delete:${resource._id}`}>Delete</button>
                    </div>
                  </article>
                )) : <p className="empty-note">Your library is empty.</p>}
              </div>
              {resourcePage.hasMore && (
                <button type="button" className="ghost-button" onClick={() => loadResources(token, resourcePage.page + 1)}>Load more</button>
              )}
            </section>
          </div>
        )}

        {activeSection === 'detail' && (
          <div className="content-stack">
            <section className="panel">
              {selectedResource ? (
                <>
                  <p className="eyebrow">Resource</p>
                  <div className="library-item-header">
                    <h2>{selectedResource.title || 'Untitled resource'}</h2>
                    <span className={`meta-pill status-${selectedResource.status}`}>{statusLabel[selectedResource.status] || selectedResource.status}</span>
                  </div>
                  {selectedResource.url && <a className="resource-url" href={selectedResource.url} target="_blank" rel="noreferrer">{selectedResource.url}</a>}
                  <p>{selectedResource.summary || 'No summary yet.'}</p>
                  {selectedResource.extractionNote && <p className="hint">{selectedResource.extractionNote}</p>}
                  {selectedResource.error && <p className="form-error">{selectedResource.error}</p>}
                  <div className="tag-list">
                    <span className="tag">{sourceLabel[selectedResource.analysisSource] || 'Not analyzed'}</span>
                    <span className="tag">{selectedResource.embeddingSource === 'provider' ? 'Embedding provider' : 'No embedding'}</span>
                    {(selectedResource.topics || []).map((topic) => <span key={topic} className="tag">{topic}</span>)}
                  </div>
                  <div className="knowledge-grid">
                    <div>
                      <h3>Concepts</h3>
                      <div className="tag-list">
                        {selectedResource.concepts?.length ? selectedResource.concepts.map((concept) => <span key={concept} className="tag">{concept}</span>) : <p className="empty-note">No concepts yet.</p>}
                      </div>
                    </div>
                    <div>
                      <h3>Extracted text</h3>
                      <p className="extract">{selectedResource.content || 'Content appears after processing.'}</p>
                    </div>
                  </div>
                  <div className="row-actions">
                    {selectedResource.status === 'failed' && (
                      <button type="button" className="primary-button" onClick={() => handleRetry(selectedResource._id)}>Retry processing</button>
                    )}
                    <button type="button" className="ghost-button" onClick={() => handleDelete(selectedResource._id)}>Delete</button>
                  </div>
                </>
              ) : <p className="empty-note">Choose a resource from the library.</p>}
            </section>
          </div>
        )}

        {activeSection === 'search' && (
          <div className="content-stack">
            <section className="panel compact-panel">
              <p className="eyebrow">Search your archive</p>
              <form onSubmit={handleSearch} className="inline-search">
                <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search concepts you have saved" />
                <button type="submit" className="primary-button" disabled={pendingAction === 'search'}>Search</button>
              </form>
              {searchState.mode && <p className="hint">Ranking: {modeLabel[searchState.mode] || searchState.mode}</p>}
            </section>
            <section className="panel">
              <p className="eyebrow">Results</p>
              {searchState.error && <p className="form-error">{searchState.error}</p>}
              {searchState.status === 'idle' && <p className="empty-note">Search runs only over resources you have saved and processed.</p>}
              {searchState.status === 'done' && !searchState.results.length && !searchState.error && (
                <p className="empty-note">Nothing in your archive matched that query.</p>
              )}
              <div className="search-results">
                {searchState.results.map((resource) => (
                  <article key={resource.id} className="search-result">
                    <div className="search-result-header">
                      <button type="button" className="text-button" onClick={() => openResource(resource.id)}><strong>{resource.title}</strong></button>
                      <span className="meta-pill">{modeLabel[resource.mode] || resource.mode}</span>
                    </div>
                    <p>{resource.summary}</p>
                    <p className="hint">{resource.why}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeSection === 'ask' && (
          <div className="content-stack">
            <section className="panel compact-panel">
              <p className="eyebrow">Ask My Brain</p>
              <form onSubmit={handleAsk} className="inline-search ask-form">
                <textarea rows="3" value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)} placeholder="What have I saved about retrieval quality?" />
                <button type="submit" className="primary-button" disabled={pendingAction === 'ask'}>Ask</button>
              </form>
            </section>
            <section className="panel">
              <p className="eyebrow">Answer</p>
              {askError && <p className="form-error">{askError}</p>}
              {!askResult && !askError && <p className="empty-note">Answers use only your saved resources. If the archive does not contain enough, MindMesh will say so.</p>}
              {askResult && (
                <div className="answer-box">
                  <div className="tag-list">
                    <span className="tag">{askResult.grounded ? 'Grounded in your archive' : 'Insufficient saved context'}</span>
                    <span className="tag">{sourceLabel[askResult.answerSource] || askResult.answerSource}</span>
                    <span className="tag">{modeLabel[askResult.retrievalMode] || askResult.retrievalMode}</span>
                  </div>
                  <p>{askResult.answer}</p>
                  {askResult.missingConcepts?.length > 0 && (
                    <p className="hint">Not covered in the retrieved resources: {askResult.missingConcepts.join(', ')}.</p>
                  )}
                  {askResult.sources?.length > 0 && (
                    <div className="source-list">
                      <h3>Sources</h3>
                      {askResult.sources.map((source) => (
                        <div key={source.id || source.title} className="source-item">
                          <button type="button" className="text-button" onClick={() => openResource(source.id || source.resourceId)}><strong>{source.title}</strong></button>
                          {source.url && <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeSection === 'knowledge' && (
          <div className="content-stack">
            <section className="panel">
              <p className="eyebrow">Knowledge</p>
              <h2>Concepts that co-occur in your archive</h2>
              <p className="lede">Connections here mean the concepts showed up in the same saved resource. They are not an inferred curriculum.</p>
              <div className="concept-list">
                {graph?.concepts?.length ? graph.concepts.map((concept) => (
                  <article key={concept.id} className="concept-card">
                    <div className="library-item-header">
                      <strong>{concept.name}</strong>
                      <span className="meta-pill">{concept.band} · {concept.resourceCount}</span>
                    </div>
                    <p className="hint">Coverage score {concept.coverageScore}. Related: {concept.related.length ? concept.related.join(', ') : 'none yet'}.</p>
                    <div className="list-stack">
                      {concept.resources.map((resource) => (
                        <button key={resource.id} type="button" className="text-button" onClick={() => openResource(resource.id)}>{resource.title}</button>
                      ))}
                    </div>
                  </article>
                )) : <p className="empty-note">Process a resource to build the knowledge map.</p>}
              </div>
            </section>
          </div>
        )}

        {activeSection === 'gaps' && (
          <div className="content-stack">
            <section className="panel">
              <p className="eyebrow">Knowledge gaps</p>
              <h2>Neighboring ideas your archive has not covered</h2>
              <p className="lede">A gap is a concept next to something you have saved, with little or no coverage of its own. The path is a recommendation.</p>
              {gaps.length ? (
                <div className="gap-list">
                  {gaps.map((gap) => (
                    <article key={gap.topic} className="gap-item">
                      <div>
                        <strong>{gap.topic}</strong>
                        <p>{gap.why}</p>
                        <p className="hint">{gap.recommendedNext}</p>
                        {gap.learningPath?.length > 0 && (
                          <div className="path">
                            {gap.learningPath.map((step, index) => (
                              <span key={`${gap.topic}-${step.name}`}>
                                {index > 0 && <span className="path-arrow">↓</span>}
                                <span className={step.status === 'covered' ? 'tag covered' : 'tag'}>{step.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="meta-pill">{gap.band}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No gaps yet. They appear when processed resources cover a concept that has an uncovered neighbor in the knowledge map.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
