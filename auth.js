// auth.js
// يعتمد على: auth, db, switchView, sanitizeInput (من index.html)

const authSection = document.getElementById('auth-section');
const authArea = document.getElementById('auth-area');
const userEmailDisplay = document.getElementById('user-display-email');

// إنشاء نماذج تسجيل الدخول/الخروج ديناميكياً
const loginForm = document.createElement('form');
const signupForm = document.createElement('form');
loginForm.className = 'auth-form';
loginForm.id = 'login-form';
loginForm.innerHTML = `
    <input type="email" id="login-email" placeholder="البريد الإلكتروني" required autocomplete="email">
    <input type="password" id="login-password" placeholder="كلمة السر (6+ أحرف)" required minlength="6" autocomplete="current-password">
    <button type="submit">تسجيل الدخول</button>
    <button type="button" id="toggle-signup" class="btn-secondary">ليس لديك حساب؟ إنشاء حساب</button>
    <p id="auth-error-message" style="color: var(--error-color);"></p>
`;
authArea.appendChild(loginForm);

signupForm.className = 'auth-form';
signupForm.id = 'signup-form';
signupForm.style.display = 'none';
signupForm.innerHTML = `
    <input type="email" id="signup-email" placeholder="البريد الإلكتروني" required autocomplete="email">
    <input type="password" id="signup-password" placeholder="كلمة سر آمنة (6+ أحرف)" required minlength="6" autocomplete="new-password">
    <button type="submit">إنشاء حساب جديد</button>
    <button type="button" id="toggle-login" class="btn-secondary">لديك حساب؟ تسجيل الدخول</button>
`;
authArea.appendChild(signupForm);

const authErrorMessage = document.getElementById('auth-error-message');

/** تحويل رمز خطأ Firebase إلى رسالة ودية */
function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'البريد الإلكتروني أو كلمة السر غير صحيحة.';
        case 'auth/email-already-in-use':
            return 'هذا البريد الإلكتروني مسجل بالفعل.';
        case 'auth/weak-password':
            return 'كلمة السر ضعيفة جداً. يجب أن تكون 6 أحرف على الأقل.';
        default:
            return 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.';
    }
}

// ==================================================
// معالجات نماذج المصادقة
// ==================================================

loginForm.onsubmit = async (e) => {
    e.preventDefault();
    authErrorMessage.textContent = '';
    const email = sanitizeInput(document.getElementById('login-email').value);
    const password = document.getElementById('login-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        authErrorMessage.textContent = getFriendlyErrorMessage(error.code);
    }
};

signupForm.onsubmit = async (e) => {
    e.preventDefault();
    authErrorMessage.textContent = '';
    const email = sanitizeInput(document.getElementById('signup-email').value);
    const password = document.getElementById('signup-password').value;
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // تسجيل المستخدم في قاعدة البيانات مع ELO افتراضي
        db.ref('users/' + userCredential.user.uid).set({ 
            email: email, 
            isOnline: true,
            rating: 1200, // ELO تقييم افتراضي
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        authErrorMessage.textContent = getFriendlyErrorMessage(error.code);
    }
};

document.getElementById('logout-button').onclick = () => {
    if (currentUserId) {
        // تحديث الحالة إلى غير متصل
        db.ref('users/' + currentUserId + '/isOnline').set(false);
    }
    auth.signOut();
};

document.getElementById('toggle-signup').onclick = () => {
    loginForm.style.display = 'none';
    signupForm.style.display = 'flex';
    authErrorMessage.textContent = '';
};

document.getElementById('toggle-login').onclick = () => {
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    authErrorMessage.textContent = '';
};

// ==================================================
// مراقبة حالة المصادقة والتحكم بالواجهات
// ==================================================

auth.onAuthStateChanged((user) => {
    if (user) {
        // المستخدم مسجل الدخول
        currentUserId = user.uid;
        window.switchView('lobby-view'); // **التبديل للردهة**

        // إظهار أزرار التحكم
        document.getElementById('header-buttons').style.display = 'flex';
        document.getElementById('lobby-button').style.display = 'inline-block';
        document.getElementById('logout-button').style.display = 'inline-block';
        userEmailDisplay.textContent = sanitizeInput(user.email);

        // تحديث حالة الاتصال ونقاط التقييم
        const userRef = db.ref('users/' + currentUserId);
        userRef.onDisconnect().update({ isOnline: false });
        userRef.update({ isOnline: true }); 
        
        userRef.once('value', (snap) => {
            const userData = snap.val();
            document.getElementById('user-rating').textContent = userData.rating || '1200';
        });

        // تحميل قائمة اللاعبين (من app.js)
        if (typeof loadPlayersList === 'function') {
            loadPlayersList(); 
        }

    } else {
        // المستخدم غير مسجل الدخول
        currentUserId = null;
        window.switchView('login-view'); // **التبديل للتسجيل**
        document.getElementById('header-buttons').style.display = 'none';
        document.getElementById('logout-button').style.display = 'none';
    }
});