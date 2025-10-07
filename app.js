// app.js
document.addEventListener('DOMContentLoaded', () => {

    const activePlayersList = document.getElementById('active-players-list');
    const inactivePlayersList = document.getElementById('inactive-players-list');
    
    // ======================= 1. قائمة اللاعبين =======================
    window.loadPlayersList = function() {
        db.ref('users').on('value', (snapshot) => {
            activePlayersList.innerHTML = '';
            inactivePlayersList.innerHTML = '';
            
            snapshot.forEach((childSnapshot) => {
                const userData = childSnapshot.val();
                const uid = childSnapshot.key;

                if (uid === currentUserId) return;

                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="player-info">
                        <strong>${sanitizeInput(userData.username || 'لاعب جديد')}</strong>
                        <span class="player-rating">(${userData.rating || 1200})</span>
                    </div>
                    <button class="btn-primary" onclick="window.challengePlayer('${uid}')" ${!userData.isOnline ? 'disabled' : ''}>
                        تحدي
                    </button>
                `;
                
                if (userData.isOnline) activePlayersList.appendChild(li);
                else inactivePlayersList.appendChild(li);
            });
        });
    };

    // ======================= 2. نظام التحدي =======================
    // (الكود هنا لم يتغير)
    let activeChallengeListener = null;

    window.challengePlayer = async function(opponentUid) {
        if (!currentUserId || opponentUid === currentUserId) return;
        const timeControl = document.getElementById('time-control-select').value;
        const matchType = document.getElementById('match-type-select').value;
        const myData = (await db.ref(`users/${currentUserId}`).once('value')).val();
        const opponentData = (await db.ref(`users/${opponentUid}`).once('value')).val();
        const challengeData = {
            challengerId: currentUserId, challengerUsername: myData.username,
            opponentId: opponentUid, opponentUsername: opponentData.username,
            timeControl: parseInt(timeControl), matchType: matchType, status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        const challengeRef = db.ref('challenges').push();
        await challengeRef.set(challengeData);
        alert(`تم إرسال التحدي إلى ${opponentData.username}.`);
        monitorChallengeResponse(challengeRef.key);
    };
    function monitorChallengeResponse(challengeKey) {
        const challengeRef = db.ref('challenges/' + challengeKey);
        challengeRef.on('value', (snap) => {
            const challenge = snap.val();
            if (!challenge) { challengeRef.off(); return; }
            if (challenge.status === 'accepted') {
                alert(`قبل ${challenge.opponentUsername} التحدي!`);
                challengeRef.off(); window.startGame(challenge.gameId);
            } else if (challenge.status === 'declined') {
                alert(`رفض ${challenge.opponentUsername} التحدي.`);
                challengeRef.off(); challengeRef.remove();
            }
        });
    }
    window.monitorIncomingChallenges = function() {
        if (activeChallengeListener) activeChallengeListener.off();
        const challengesRef = db.ref('challenges').orderByChild('opponentId').equalTo(currentUserId);
        activeChallengeListener = challengesRef.on('child_added', (snap) => {
            const challenge = snap.val();
            if (challenge.status === 'pending') showChallengeModal(snap.key, challenge);
        });
    };
    function showChallengeModal(key, data) {
        const modal = document.getElementById('challenge-modal');
        document.getElementById('challenge-details').innerHTML = 
            `اللاعب <strong>${sanitizeInput(data.challengerUsername)}</strong> يتحدّاك في مباراة ${data.matchType === 'rated' ? 'مصنفة' : 'ودية'}.<br>
            الوقت: ${data.timeControl} دقائق لكل لاعب.`;
        const acceptBtn = document.getElementById('accept-challenge-btn');
        const declineBtn = document.getElementById('decline-challenge-btn');
        const newAcceptBtn = acceptBtn.cloneNode(true);
        const newDeclineBtn = declineBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
        declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);
        newAcceptBtn.onclick = () => { acceptChallenge(key, data); modal.style.display = 'none'; };
        newDeclineBtn.onclick = () => { db.ref(`challenges/${key}`).update({ status: 'declined' }); modal.style.display = 'none'; };
        modal.style.display = 'flex';
    }
    async function acceptChallenge(challengeKey, challengeData) {
        const gameRef = db.ref('games').push();
        const gameId = gameRef.key;
        const isChallengerWhite = Math.random() < 0.5;
        const whitePlayer = isChallengerWhite ? challengeData.challengerId : challengeData.opponentId;
        const blackPlayer = isChallengerWhite ? challengeData.opponentId : challengeData.challengerId;
        const gameData = {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", status: 'active',
            whitePlayerId: whitePlayer, blackPlayerId: blackPlayer, turn: 'w',
            timeControl: challengeData.timeControl, whiteTime: challengeData.timeControl * 60,
            blackTime: challengeData.timeControl * 60, moves: [],
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        await gameRef.set(gameData);
        await db.ref(`challenges/${challengeKey}`).update({ status: 'accepted', gameId: gameId });
        window.startGame(gameId);
    }
    
    // ======================= 3. الإعدادات (مع تعديل الملف الشخصي) =======================
    const settingsModal = document.getElementById('settings-modal');
    const themeSelect = document.getElementById('theme-select');
    const saveUsernameBtn = document.getElementById('save-username-button');
    const usernameInput = document.getElementById('username-edit-input');
    const settingsFeedback = document.getElementById('settings-feedback');

    document.getElementById('settings-button').onclick = () => {
        settingsFeedback.textContent = '';
        settingsFeedback.className = 'feedback-text';
        settingsModal.style.display = "flex";
    };
    settingsModal.querySelector('.close-button').onclick = () => settingsModal.style.display = "none";
    
    themeSelect.addEventListener('change', (e) => {
        document.body.classList.toggle('light-theme', e.target.value === 'light');
    });

    saveUsernameBtn.addEventListener('click', async () => {
        const newUsername = sanitizeInput(usernameInput.value.trim());

        if (newUsername.length < 3 || newUsername.length > 15) {
            settingsFeedback.textContent = 'الاسم يجب أن يكون بين 3 و 15 حرفاً.';
            settingsFeedback.className = 'feedback-text error';
            return;
        }

        try {
            const usersRef = db.ref('users');
            const snapshot = await usersRef.orderByChild('username').equalTo(newUsername).once('value');
            
            // تحقق مما إذا كان الاسم محجوزاً من قبل لاعب آخر
            if (snapshot.exists() && Object.keys(snapshot.val())[0] !== currentUserId) {
                settingsFeedback.textContent = 'هذا الاسم مستخدم بالفعل.';
                settingsFeedback.className = 'feedback-text error';
            } else {
                // تحديث الاسم
                await usersRef.child(currentUserId).update({ username: newUsername });
                settingsFeedback.textContent = 'تم حفظ الاسم بنجاح!';
                settingsFeedback.className = 'feedback-text success';
            }
        } catch (error) {
            settingsFeedback.textContent = 'حدث خطأ أثناء الحفظ.';
            settingsFeedback.className = 'feedback-text error';
            console.error("Error updating username:", error);
        }
    });

    document.getElementById('lobby-button').onclick = () => switchView('lobby-view');
});