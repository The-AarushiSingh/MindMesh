import { useState } from 'react';

function PasswordField({ id, label, value, onChange, placeholder, autoComplete = 'current-password' }) {
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="ghost-button password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="eye-icon">
            <path
              d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            {visible && <path d="M5 19L19 5" stroke="currentColor" strokeWidth="1.6" />}
          </svg>
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}

export default PasswordField;
