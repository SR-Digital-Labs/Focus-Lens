import { useState, type FormEvent } from 'react';
import { ArrowRight, Focus, Sparkles } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string) => void;
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const greeting = getGreeting(new Date());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Enter your name to continue.');
      return;
    }
    onLogin(trimmedUsername);
  }

  return (
    <main className="login-page">
      <div className="login-glow login-glow-left" aria-hidden="true" />
      <div className="login-glow login-glow-right" aria-hidden="true" />
      <section className="login-scene" aria-label="FocusLens sign in">
        <div className="login-art" aria-hidden="true">
          <div className="login-orbit login-orbit-back" />
          <div className="login-orbit login-orbit-front" />
          <div className="login-cube">
            <div className="login-cube-face login-cube-front"><Focus size={48} /></div>
            <div className="login-cube-face login-cube-top" />
            <div className="login-cube-face login-cube-side" />
          </div>
          <span className="login-sparkle login-sparkle-one"><Sparkles size={20} /></span>
          <span className="login-sparkle login-sparkle-two"><Sparkles size={15} /></span>
          <div className="login-art-caption">
            <span className="login-status-dot" />
            YOUR SPACE TO FOCUS
          </div>
        </div>

        <div className="login-card">
          <div className="login-brand">
            <span className="login-brand-icon"><Focus size={19} /></span>
            <span>FocusLens</span>
          </div>
          <p className="login-eyebrow">A LITTLE SPACE, JUST FOR YOU</p>
          <h1>{greeting}<br /><span>let’s focus.</span></h1>
          <p className="login-description">
            Make today a little more intentional. What should we call you?
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-username">Your name</label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="nickname"
              autoFocus
              maxLength={40}
              placeholder="e.g. Kavi"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (error) setError('');
              }}
            />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit">
              Enter your workspace
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-local-note">A temporary local profile — no password or account needed.</p>
        </div>
      </section>
      <p className="login-footer">Breathe in. Focus up. You’ve got this.</p>
    </main>
  );
};

export default Login;
