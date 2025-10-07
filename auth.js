// auth.js
document.addEventListener('DOMContentLoaded', () => {
    const authArea = document.getElementById('auth-area');
    const userDisplayName = document.getElementById('user-display-name');
    const userRatingDisplay = document.getElementById('user-rating');
    const authErrorMessage = document.getElementById('auth-error-message');

    // ======================= بناء النماذج ديناميكياً =======================
    function buildForms() {
        authArea.innerHTML = `
            <form id="login-form" class="auth-form">
                <input type="email" id="login-email" class="control-input" placeholder="البريد الإلكتروني" required autocomplete="email">
                <input type="password" id="login-password" class="control-input" placeholder="كلمة المرور" required autocomplete="current-password">
                <button type="submit" class="btn-primary">تسجيل الدخول</button>
                <button type="button" id="toggle-signup" class="btn-secondary">ليس لديك حساب؟</button>
            </form>

            <form id="signup-form" class="auth-form" style="display:none;">
                <input type="text" id="signup-username" class="control-input" placeholder="اسم المستخدم (فريد)" required autocomplete="username">
                <input type="email" id="signup-email" class="control-input" placeholder="البريد الإلكتروني" required autocomplete="email">
                <input type="password" id="signup-password" class="control-input" placeholder="كلمة المرور (6+ أحرف)" required minlength="6" autocomplete="new-password">
                <input type="password" id="signup-password-confirm" class="control-input" placeholder="تأكيد كلمة المرور" required minlength="6">
                <button type="submit" class="btn-primary">إنشاء حساب</button>
                <button type="button" id="toggle-login" class="btn-secondary">لديك حساب بالفعل؟</button>
            </form>
        `;
        addFormListeners();
    }

    // ======================= معالجات الأحداث =======================
    function addFormListeners() {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('signup-form').addEventListener('submit', handleSignup);
        document.getElementById('toggle-signup').addEventListener('click', () => toggleForms(false));
        document.getElementById('toggle-login').addEventListener('click', () => toggleForms(true));
        document.getElementById('logout-button').addEventListener('click', handleLogout);
    }

    const handleLogin = async (e) => {
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

    const handleSignup = async (e) => {
        e.preventDefault();
        authErrorMessage.textContent = '';
        const username = sanitizeInput(document.getElementById('signup-username').value.trim());
        const email = sanitizeInput(document.getElementById('signup-email').value);
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;

        if (password !== passwordConfirm) return authErrorMessage.textContent = 'كلمتا المرور غير متطابقتين!';
        if (username.length < 3 || username.length > 15) return authErrorMessage.textContent = 'اسم المستخدم يجب أن يكون بين 3 و 15 حرفاً.';

        try {
            // **الإصلاح الرئيسي هنا:** نتأكد أننا نستخدم مرجع DB الذي تم تهيئته بشكل صحيح
            const usersRef = db.ref('users');
            const usernameSnapshot = await usersRef.orderByChild('username').equalTo(username).once('value');
            if (usernameSnapshot.exists()) {
                throw { code: 'auth/username-already-in-use' };
            }

            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            await usersRef.child(userCredential.user.uid).set({
                username: username,
                email: email,
                isOnline: true,
                rating: 1200,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

        } catch (error) {
            authErrorMessage.textContent = getFriendlyErrorMessage(error.code);
        }
    };
    
    const handleLogout = () => {
        if (currentUserId) db.ref(`users/${currentUserId}/isOnline`).set(false);
        auth.signOut();
    };

    function toggleForms(showLogin) {
        document.getElementById('login-form').style.display = showLogin ? 'flex' : 'none';
        document.getElementById('signup-form').style.display = showLogin ? 'none' : 'flex';
        authErrorMessage.textContent = '';
    }

    // ======================= إدارة حالة المصادقة =======================
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUserId = user.uid;
            const userRef = db.ref('users/' + currentUserId);

            userRef.onDisconnect().update({ isOnline: false });
            userRef.update({ isOnline: true });

            userRef.on('value', (snap) => {
                if (!snap.exists()) return;
                const userData = snap.val();
                const safeUsername = sanitizeInput(userData.username || "لاعب جديد"); // اسم افتراضي
                userDisplayName.textContent = safeUsername;
                userRatingDisplay.textContent = userData.rating || 1200;
                document.getElementById('player-name').textContent = safeUsername;
                document.getElementById('username-edit-input').value = userData.username || "";
            });

            switchView('lobby-view');
            document.getElementById('header-buttons').style.display = 'flex';
            document.getElementById('logout-button').style.display = 'block';
            document.getElementById('lobby-button').style.display = 'block';

            if (window.loadPlayersList) window.loadPlayersList();
            if (window.monitorIncomingChallenges) window.monitorIncomingChallenges();

        } else {
            currentUserId = null;
            switchView('login-view');
            document.getElementById('header-buttons').style.display = 'none';
        }
    });
    
    function getFriendlyErrorMessage(code) {
        switch (code) {
            case 'auth/user-not-found': case 'auth/wrong-password': return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            case 'auth/email-already-in-use': return 'هذا البريد الإلكتروني مسجل بالفعل.';
            case 'auth/weak-password': return 'كلمة المرور ضعيفة (6 أحرف على الأقل).';
            case 'auth/username-already-in-use': return 'اسم المستخدم هذا محجوز، اختر اسماً آخر.';
            default: return 'حدث خطأ. يرجى المحاولة مرة أخرى.';
        }
    }

    buildForms();
});