// app.js
// يعتمد على: db, currentUserId, switchView (من index.html)

const activePlayersList = document.getElementById('active-players-list');
const inactivePlayersList = document.getElementById('inactive-players-list');
const initialFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ==================================================
// 1. منطق قائمة اللاعبين النشطين
// ==================================================

/** تحميل وتحديث قائمة اللاعبين في الوقت الفعلي */
function loadPlayersList() {
    const usersRef = db.ref('users').orderByChild('isOnline');
    
    usersRef.on('value', (snapshot) => {
        activePlayersList.innerHTML = '';
        inactivePlayersList.innerHTML = '';
        
        if (!snapshot.exists()) return;
        
        snapshot.forEach((userSnap) => {
            const userData = userSnap.val();
            const uid = userSnap.key;
            
            // تخطي المستخدم الحالي
            if (uid === currentUserId) return; 

            const li = document.createElement('li');
            const statusDot = `<span class="status-dot ${userData.isOnline ? 'active' : 'inactive'}"></span>`;
            
            const displayEmail = userData.email ? userData.email.split('@')[0] : 'مستخدم غير معروف';
            const rating = userData.rating || '1200';

            li.innerHTML = `
                <div>${statusDot} ${displayEmail} (${rating})</div>
                <button class="btn-primary" onclick="challengePlayer('${uid}', '${userData.email}', ${rating})" ${!userData.isOnline ? 'disabled' : ''}>
                    تحدي
                </button>
            `;
            
            if (userData.isOnline) {
                activePlayersList.appendChild(li);
            } else {
                inactivePlayersList.appendChild(li);
            }
        });
    });
    
    // تفعيل مراقبة التحديات الواردة
    monitorIncomingChallenges(); 
}

// جعل الدالة متاحة لملف auth.js
window.loadPlayersList = loadPlayersList;

// ==================================================
// 2. نظام التحدي
// ==================================================

/** إرسال طلب تحدي إلى الخصم عبر Firebase */
window.challengePlayer = function(opponentUid, opponentEmail, opponentRating) {
    if (!currentUserId || currentUserId === opponentUid) return;

    const timeControl = document.getElementById('time-control-select').value;
    const matchType = document.getElementById('match-type-select').value;
    
    if (confirm(`هل أنت متأكد من تحدي ${opponentEmail}؟\nالمدة: ${timeControl} دقيقة.\nالنوع: ${matchType}.`)) {
        
        const challengeKey = db.ref('challenges').push().key;
        
        const challengeData = {
            challengerId: currentUserId,
            opponentId: opponentUid,
            challengerEmail: auth.currentUser.email,
            opponentEmail: opponentEmail,
            timeControl: timeControl,
            matchType: matchType,
            status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        db.ref('challenges/' + challengeKey).set(challengeData)
            .then(() => {
                alert(`تم إرسال طلب التحدي إلى ${opponentEmail}. انتظر الموافقة.`);
            })
            .catch(error => {
                console.error("Error sending challenge:", error);
                alert('فشل إرسال التحدي.');
            });
            
        monitorChallengeResponse(challengeKey);
    }
};

/** مراقبة رد الخصم على التحدي الصادر */
function monitorChallengeResponse(challengeKey) {
    db.ref('challenges/' + challengeKey).on('value', (snap) => {
        const challenge = snap.val();
        if (!challenge) return;

        if (challenge.status === 'accepted' && challenge.gameId) {
            alert('تم قبول التحدي! جارٍ بدء المباراة.');
            currentGameId = challenge.gameId;
            db.ref('challenges/' + challengeKey).off();
            startGame(currentGameId); // من game.js
        } else if (challenge.status === 'declined') {
            alert(`التحدي ضد ${challenge.opponentEmail} تم رفضه.`);
            db.ref('challenges/' + challengeKey).off();
            db.ref('challenges/' + challengeKey).remove();
        }
    });
}

/** مراقبة التحديات الواردة */
function monitorIncomingChallenges() {
    db.ref('challenges').orderByChild('opponentId').equalTo(currentUserId).on('child_added', (snap) => {
        const challenge = snap.val();
        const challengeKey = snap.key;

        if (challenge.status === 'pending') {
            const confirmChallenge = confirm(
                `لديك تحدٍ جديد من ${challenge.challengerEmail}!\n` +
                `المدة: ${challenge.timeControl} دقيقة. النوع: ${challenge.matchType}.\n` +
                `هل تقبل؟`
            );

            if (confirmChallenge) {
                acceptChallenge(challengeKey, challenge);
            } else {
                db.ref('challenges/' + challengeKey).update({ status: 'declined' });
            }
        }
    });
}

/** قبول التحدي وإنشاء المباراة */
function acceptChallenge(challengeKey, challengeData) {
    // 1. إنشاء مباراة جديدة
    const gameId = db.ref('games').push().key;

    const gameData = {
        fen: initialFEN,
        status: 'playing',
        // تحديد الدور الأول عشوائياً
        turn: Math.random() < 0.5 ? challengeData.challengerId : challengeData.opponentId, 
        playerWhiteId: challengeData.challengerId,
        playerBlackId: challengeData.opponentId,
        timeControl: parseInt(challengeData.timeControl) * 60, // بالثواني
        matchType: challengeData.matchType,
        moves: ['Game started'],
    };

    db.ref('games/' + gameId).set(gameData)
        .then(() => {
            // 2. تحديث سجل التحدي بحالة القبول ومعرف اللعبة
            return db.ref('challenges/' + challengeKey).update({
                status: 'accepted',
                gameId: gameId
            });
        })
        .then(() => {
            currentGameId = gameId;
            startGame(currentGameId); // بدء اللعبة
        })
        .catch(error => {
            console.error("Error accepting challenge:", error);
            alert('فشل قبول التحدي وإنشاء المباراة.');
        });
}

// ==================================================
// 3. منطق البحث
// ==================================================

document.getElementById('search-button').onclick = () => {
    const searchTerm = sanitizeInput(document.getElementById('search-input').value.trim());
    if (searchTerm.length < 3) return alert('أدخل 3 أحرف على الأقل للبحث.');
    
    alert(`البحث عن: ${searchTerm}. هذه الميزة تتطلب تنفيذ استعلامات Firebase المتقدمة.`);
    // منطق البحث الفعلي يحتاج إلى استعلامات DB متقدمة
}

// ==================================================
// 4. منطق الإعدادات (Modal)
// ==================================================

const settingsModal = document.getElementById('settings-modal');
document.getElementById('settings-button').onclick = () => {
    settingsModal.style.display = "block";
}
settingsModal.querySelector('.close-button').onclick = () => {
    settingsModal.style.display = "none";
}
window.onclick = (event) => {
    if (event.target === settingsModal) {
        settingsModal.style.display = "none";
    }
}
document.getElementById('lobby-button').onclick = () => {
    window.switchView('lobby-view'); // العودة إلى الردهة
}