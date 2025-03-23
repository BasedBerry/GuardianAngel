function toggleForms(mode) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  if (mode === 'login') {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  } else {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  }
}

function triggerCatReaction() {
  const catFace = document.getElementById('cat-face');
  const original = catFace.textContent;

  catFace.textContent = '( ✧≖ ͜ʖ≖)';
  catFace.classList.add('cat-react');

  setTimeout(() => {
    catFace.textContent = original;
    catFace.classList.remove('cat-react');
  }, 1800);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('show-login')?.addEventListener('click', () => toggleForms('login'));
  document.getElementById('show-signup')?.addEventListener('click', () => toggleForms('signup'));

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;

    const res = await fetch('http://localhost:3000/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (res.ok) {
      alert('Signup successful! Please log in.');
      toggleForms('login');
    } else {
      alert(data.message || 'Signup failed');
    }
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const res = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (res.ok) {
      alert('Login successful!');
      chrome.storage.local.set({ authToken: data.token, userId: data.userId }, () => {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('preferences-section').classList.remove('hidden');
      });
    } else {
      alert(data.error || 'Login failed');
    }
  });

  document.getElementById('save-preferences').addEventListener('click', async () => {
    const positive = document.getElementById('positive-preferences').value;
    const negative = document.getElementById('negative-preferences').value;

    if (!positive && !negative) {
      alert('Please enter at least one preference.');
      return;
    }

    chrome.storage.local.get(['authToken'], async ({ authToken }) => {
      if (!authToken) {
        alert('Not authenticated.');
        return;
      }

      const res = await fetch('http://localhost:3000/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: JSON.stringify({ positivePreferences: positive, negativePreferences: negative }),
      });

      const data = await res.json();
     if (res.ok) {
        triggerCatReaction();

      setTimeout(() => {
          alert('Preferences saved!');
        }, 1000); // wait 1 second so user sees the cat reaction
} else {
        alert(data.error || 'Failed to save preferences.');
      }
    });
  });
});
