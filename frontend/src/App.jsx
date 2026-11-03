import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL;

async function call(path, method = 'GET', body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export default function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) call('/me', 'GET', null, token).then((d) => setUser(d.email)).catch(() => localStorage.removeItem('token'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (mode === 'register') {
        await call('/register', 'POST', { email, password });
        setMsg('Registered. Please log in.');
        setMode('login');
      } else {
        const { token } = await call('/login', 'POST', { email, password });
        localStorage.setItem('token', token);
        setUser(email.toLowerCase());
      }
    } catch (err) {
      setMsg(err.message);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  const box = { maxWidth: 320, margin: '80px auto', fontFamily: 'sans-serif' };
  const input = { display: 'block', width: '100%', padding: 8, marginBottom: 10, boxSizing: 'border-box' };

  if (user)
    return (
      <div style={box}>
        <h2>Welcome, {user}</h2>
        <button onClick={logout}>Logout</button>
      </div>
    );

  return (
    <form style={box} onSubmit={submit}>
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>{' '}
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account?' : 'Have an account?'}
      </button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
