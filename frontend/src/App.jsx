import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE = 'http://localhost:5000/api';
const navItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'ask', label: 'Ask' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'gaps', label: 'Gaps' },
];

const candidateTopics = ['retrieval', 'embeddings', 'reranking', 'knowledge graphs', 'vector search', 'evaluation', 'agents', 'llms'];

const readToken = () => localStorage.getItem('mindmesh-token');

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const apiRequest = async (path, options = {}, token) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

function App() {
  const [token, setToken] = useState(readToken());
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [resourceForm, setResourceForm] = useState({ title: '', url: '', description: '' });
  const [resourceError, setResourceError] = useState('');
  const [resources, setResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('improving retrieval quality in rag');
  const [searchResults, setSearchResults] = useState([]);
  const [askQuestion, setAskQuestion] = useState('What have I saved about retrieval quality and embeddings?');
  const [askResult, setAskResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadResources = async (currentToken = token) => {
    if (!currentToken) return;

    try {
      const data = await apiRequest('/resources', {}, currentToken);
      setResources(data.resources || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    localStorage.setItem('mindmesh-token', token);

    apiRequest('/auth/me', {}, token)
      .then((data) => setUser(data.user))
      .catch((error) => {
        console.error(error);
        setToken(null);
        localStorage.removeItem('mindmesh-token');
      });

    loadResources(token);
  }, [token]);

  const topicFrequency = useMemo(() => {
    const counts = {};

    resources.forEach((resource) => {
      (resource.topics || []).forEach((topic) => {
        const key = String(topic).trim();
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [resources]);

  const conceptList = useMemo(() => {
    const concepts = new Set();
    resources.forEach((resource) => {
      (resource.concepts || []).forEach((concept) => concepts.add(concept));
    });
    return [...concepts];
  }, [resources]);

  const suggestedGaps = useMemo(() => {
    const existing = new Set(topicFrequency.map(([topic]) => topic.toLowerCase()));
    return candidateTopics
      .map((topic) => ({
        topic,
        observed: existing.has(topic.toLowerCase()),
        detail: existing.has(topic.toLowerCase())
          ? `You have saved material related to ${topic}.`
          : `You have not yet built a substantial archive around ${topic}.`,
      }))
      .filter((item) => !item.observed)
      .slice(0, 4);
  }, [topicFrequency]);

  const recentResources = resources.slice(0, 4);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    try {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const payload = authMode === 'register'
        ? authForm
        : { email: authForm.email, password: authForm.password };

      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (authMode === 'login') {
        setToken(data.token);
      } else {
        setAuthMode('login');
        setAuthForm({ name: '', email: '', password: '' });
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleResourceSubmit = async (event) => {
    event.preventDefault();
    setResourceError('');

    if (!resourceForm.url.trim()) {
      setResourceError('A URL is required');
      return;
    }

    setLoading(true);

    try {
      await apiRequest('/resources', {
        method: 'POST',
        body: JSON.stringify({
          title: resourceForm.title,
          url: resourceForm.url,
          description: resourceForm.description,
        }),
      }, token);

      setResourceForm({ title: '', url: '', description: '' });
      setActiveSection('library');
      await loadResources();
    } catch (error) {
      setResourceError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);

    try {
      const data = await apiRequest(`/search?q=${encodeURIComponent(searchQuery)}`, {}, token);
      setSearchResults(data.results || []);
    } catch (error) {
      console.error(error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!askQuestion.trim()) return;

    setLoading(true);

    try {
      const data = await apiRequest('/brain/ask', {
        method: 'POST',
        body: JSON.stringify({ question: askQuestion }),
      }, token);
      setAskResult(data);
    } catch (error) {
      console.error(error);
      setAskResult({ answer: 'I could not retrieve enough context from your archive for that question.', sources: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mindmesh-token');
    setToken(null);
    setUser(null);
    setActiveSection('overview');
  };

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-header">
            <p className="eyebrow">MindMesh</p>
            <h1>Personal knowledge archive</h1>
          </div>

          <div className="auth-toggle">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'register' && (
              <label>
                Name
                <input
                  type="text"
                  value={authForm.name}
                  onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  placeholder="A. Reader"
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                placeholder="name@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                placeholder="••••••••"
              />
            </label>

            {authError && <p className="form-error">{authError}</p>}

            <button type="submit" className="primary-button">
              {authMode === 'login' ? 'Enter archive' : 'Create account'}
            </button>
          </form>
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
            <button
              key={item.id}
              type="button"
              className={item.id === activeSection ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span className="meta-label">Signed in</span>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
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
            <button type="button" className="ghost-button">Library</button>
            <button type="button" className="primary-button" onClick={() => setActiveSection('library')}>New resource</button>
          </div>
        </header>

        {activeSection === 'overview' && (
          <div className="content-stack">
            <section className="panel intro-panel">
              <p className="eyebrow">Overview</p>
              <h2>Your archive at a glance</h2>
              <div className="metrics-row">
                <div className="metric-box">
                  <span className="metric-label">Saved</span>
                  <strong>{resources.length}</strong>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Processed</span>
                  <strong>{resources.filter((resource) => resource.status === 'processed').length}</strong>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Topics</span>
                  <strong>{topicFrequency.length}</strong>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Concepts</span>
                  <strong>{conceptList.length}</strong>
                </div>
              </div>
            </section>

            <section className="panel grid-two">
              <div>
                <p className="eyebrow">Recent resources</p>
                <div className="list-stack">
                  {recentResources.length ? recentResources.map((resource) => (
                    <div key={resource._id} className="record-row">
                      <div>
                        <strong>{resource.title || 'Untitled resource'}</strong>
                        <p>{resource.summary || resource.description || 'No summary yet.'}</p>
                      </div>
                      <span className="meta-pill">{resource.status}</span>
                    </div>
                  )) : <p className="empty-note">No resources saved yet.</p>}
                </div>
              </div>

              <div>
                <p className="eyebrow">Active topics</p>
                <div className="tag-list">
                  {topicFrequency.length ? topicFrequency.slice(0, 8).map(([topic, count]) => (
                    <span key={topic} className="tag">{topic} · {count}</span>
                  )) : <p className="empty-note">Topics will appear after resources are processed.</p>}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'library' && (
          <div className="content-stack">
            <section className="panel form-panel">
              <p className="eyebrow">Add resource</p>
              <form onSubmit={handleResourceSubmit} className="resource-form">
                <div className="field-row">
                  <label>
                    Title
                    <input
                      type="text"
                      value={resourceForm.title}
                      onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })}
                      placeholder="Retrieval quality in RAG"
                    />
                  </label>
                  <label>
                    URL
                    <input
                      type="url"
                      value={resourceForm.url}
                      onChange={(event) => setResourceForm({ ...resourceForm, url: event.target.value })}
                      placeholder="https://example.com/article"
                    />
                  </label>
                </div>

                <label>
                  Note
                  <textarea
                    rows="4"
                    value={resourceForm.description}
                    onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })}
                    placeholder="Why this resource matters to your archive..."
                  />
                </label>

                {resourceError && <p className="form-error">{resourceError}</p>}

                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? 'Saving...' : 'Save resource'}
                </button>
              </form>
            </section>

            <section className="panel">
              <p className="eyebrow">Library</p>
              <div className="library-list">
                {resources.length ? resources.map((resource) => (
                  <article key={resource._id} className="library-item">
                    <div className="library-item-header">
                      <div>
                        <strong>{resource.title || 'Untitled resource'}</strong>
                        <span className="resource-type">{resource.type || 'article'}</span>
                      </div>
                      <span className="meta-pill">{resource.status}</span>
                    </div>

                    <p className="resource-url">{resource.url}</p>
                    <p className="resource-summary">{resource.summary || resource.description || 'Summary pending.'}</p>
                    <div className="library-meta">
                      <span>{formatDate(resource.createdAt)}</span>
                      <span>{resource.topics?.length ? resource.topics.slice(0, 3).join(' · ') : 'No topics yet'}</span>
                    </div>
                  </article>
                )) : <p className="empty-note">Your library is empty.</p>}
              </div>
            </section>
          </div>
        )}

        {activeSection === 'search' && (
          <div className="content-stack">
            <section className="panel compact-panel">
              <p className="eyebrow">Search your archive</p>
              <form onSubmit={handleSearch} className="inline-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search for ideas, topics, and concepts"
                />
                <button type="submit" className="primary-button" disabled={loading}>Search</button>
              </form>
            </section>

            <section className="panel">
              <p className="eyebrow">Results</p>
              {searchResults.length ? (
                <div className="search-results">
                  {searchResults.map((resource) => (
                    <article key={resource.id} className="search-result">
                      <div className="search-result-header">
                        <strong>{resource.title}</strong>
                        <span className="meta-pill">{resource.type}</span>
                      </div>
                      <p className="resource-url">{resource.url}</p>
                      <p>{resource.summary}</p>
                      <div className="tag-list small-tags">
                        {(resource.topics || []).slice(0, 4).map((topic) => (
                          <span key={topic} className="tag">{topic}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Use a concept-rich query like “retrieval quality in rag”.</p>
              )}
            </section>
          </div>
        )}

        {activeSection === 'ask' && (
          <div className="content-stack">
            <section className="panel compact-panel">
              <p className="eyebrow">Ask your knowledge</p>
              <form onSubmit={handleAsk} className="inline-search ask-form">
                <textarea
                  rows="3"
                  value={askQuestion}
                  onChange={(event) => setAskQuestion(event.target.value)}
                  placeholder="Ask about your saved resources and notes..."
                />
                <button type="submit" className="primary-button" disabled={loading}>Ask</button>
              </form>
            </section>

            <section className="panel">
              <p className="eyebrow">Answer</p>
              {askResult ? (
                <div className="answer-box">
                  <p>{askResult.answer}</p>
                  {askResult.sources?.length ? (
                    <div className="source-list">
                      <h3>Sources</h3>
                      {askResult.sources.map((source) => (
                        <div key={source.id || source.title} className="source-item">
                          <strong>{source.title}</strong>
                          <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="empty-note">The answer will be grounded in the resources you’ve saved.</p>
              )}
            </section>
          </div>
        )}

        {activeSection === 'knowledge' && (
          <div className="content-stack">
            <section className="panel">
              <p className="eyebrow">Knowledge map</p>
              <div className="knowledge-grid">
                <div>
                  <h3>Topics</h3>
                  <ul className="detail-list">
                    {topicFrequency.length ? topicFrequency.map(([topic, count]) => (
                      <li key={topic}><span>{topic}</span><strong>{count}</strong></li>
                    )) : <li className="empty-note">No topics yet.</li>}
                  </ul>
                </div>
                <div>
                  <h3>Concepts</h3>
                  <div className="tag-list">
                    {conceptList.length ? conceptList.map((concept) => (
                      <span key={concept} className="tag">{concept}</span>
                    )) : <p className="empty-note">No concepts extracted yet.</p>}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'gaps' && (
          <div className="content-stack">
            <section className="panel">
              <p className="eyebrow">Knowledge gaps</p>
              {suggestedGaps.length ? (
                <div className="gap-list">
                  {suggestedGaps.map((gap) => (
                    <article key={gap.topic} className="gap-item">
                      <div>
                        <strong>{gap.topic}</strong>
                        <p>{gap.detail}</p>
                      </div>
                      <button type="button" className="ghost-button">Explore</button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Your archive is broad enough to show no obvious gaps yet.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
