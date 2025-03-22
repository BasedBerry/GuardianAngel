const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const preferencesSection = document.getElementById('preferences-section');
const authSection = document.getElementById('auth-section');
const savePreferencesButton = document.getElementById('save-preferences');
const preferencesInput = document.getElementById('preferences-input');

let authToken = null;

// Handle Sign Up
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;

    const response = await fetch('http://localhost:3000/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (response.ok) {
        alert('Sign up successful! Please log in.');
    } else {
        alert(data.error || 'Sign up failed.');
    }
});

// Handle Log In
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const response = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (response.ok) {
        authToken = data.token;
        alert('Login successful!');
        authSection.classList.add('hidden');
        preferencesSection.classList.remove('hidden');
    } else {
        alert(data.error || 'Login failed.');
    }
});

// Handle Save Preferences
savePreferencesButton.addEventListener('click', async () => {
    const preferences = preferencesInput.value;

    if (!preferences) {
        alert('Please enter your preferences.');
        return;
    }

    const response = await fetch('http://localhost:3000/preferences', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken,
        },
        body: JSON.stringify({ positivePreferences: preferences }),
    });

    const data = await response.json();
    if (response.ok) {
        alert('Preferences saved successfully!');
    } else {
        alert(data.error || 'Failed to save preferences.');
    }
});