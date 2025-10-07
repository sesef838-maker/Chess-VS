// app.js
document.addEventListener('DOMContentLoaded', () => {

    const activePlayersList = document.getElementById('active-players-list');
    const inactivePlayersList = document.getElementById('inactive-players-list');
    
    // ======================= 1. قائمة اللاعبين =======================
    window.loadPlayersList = function() {
        const usersRef = db.ref('users');
        
        usersRef.on('value', (snapshot) => {
            activePlayersList.innerHTML = '';
            inactivePlayersList.innerHTML = '';
            
            snapshot.forEach((childSnapshot) => {
                const userData = childSnapshot.val();
                const uid = childSnapshot.key;

                if (uid === currentUserId) return; // لا تعرض نفسك في القائمة

                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="player-info">
                        <strong>${sanitizeInput(userData.username)}</strong>
                        <span class="player-rating">(${userData.rating || 1200})</span>
                    </div>
                    <button class="btn-primary" onclick="window.challengePlayer('${uid}')" ${!userData.isOnline ? 'disabled' : ''}>
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
    };

    // ======================= 2. نظام التحدي =======================
    let activeChallengeListener = null;

    // إرسال تحدٍ
    window.challengePlayer = async function(opponentUid) {
        if (!currentUserId || opponentUid === currentUserId) return;

        const timeControl = document.getElementById('time-control-select').value;
        const matchType = document.getElementById('match-type-select').value;
        
        const myData = (await db.ref(`users/${currentUserId}`).once('value')).val();
        const opponentData = (await db.ref(`users/${opponentUid}`).once('value')).val();

        const challengeData = {
            challengerId: currentUserId,
            challengerUsername: myData.username,
            opponentId: opponentUid,
            opponentUsername: opponentData.username,
            timeControl: parseInt(timeControl),
            matchType: matchType,
            status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        const challengeRef = db.ref('challenges').push();
        await challengeRef.set(challengeData);
        alert(`تم إرسال التحدي إلى ${opponentData.username}.`);

        // مراقبة الرد
        monitorChallengeResponse(challengeRef.key);
    };

    // مراقبة رد الخصم
    function monitorChallengeResponse(challengeKey) {
        const challengeRef = db.ref('challenges/' + challengeKey);
        challengeRef.on('value', (snap) => {
            const challenge = snap.val();
            if (!challenge) {
                challengeRef.off(); // توقف عن الاستماع إذا حُذف التحدي
                return;
            }

            if (challenge.status === 'accepted') {
                alert(`قبل ${challenge.opponentUsername} التحدي!`);
                challengeRef.off();
                window.startGame(challenge.gameId);
            } else if (challenge.status === 'declined') {
                alert(`رفض ${challenge.opponentUsername} التحدي.`);
                challengeRef.off();
                challengeRef.remove(); // تنظيف قاعدة البيانات
            }
        });
    }

    // مراقبة التحديات الواردة
    window.monitorIncomingChallenges = function() {
        if (activeChallengeListener) activeChallengeListener.off(); // إزالة المستمع القديم

        const challengesRef = db.ref('challenges').orderByChild('opponentId').equalTo(currentUserId);
        
        activeChallengeListener = challengesRef.on('child_added', (snap) => {
            const challenge = snap.val();
            const challengeKey = snap.key;

            if (challenge.status === 'pending') {
                showChallengeModal(challengeKey, challenge);
            }
        });
    };

    // عرض نافذة التحدي المنبثقة
    function showChallengeModal(key, data) {
        const modal = document.getElementById('challenge-modal');
        document.getElementById('challenge-details').innerHTML = 
            `اللاعب <strong>${sanitizeInput(data.challengerUsername)}</strong> يتحدّاك في مباراة ${data.matchType === 'rated' ? 'مصنفة' : 'ودية'}.<br>
            الوقت: ${data.timeControl} دقائق لكل لاعب.`;
        
        const acceptBtn = document.getElementById('accept-challenge-btn');
        const declineBtn = document.getElementById('decline-challenge-btn');

        // يجب استنساخ الأزرار لإزالة أي مستمعين قدامى
        const newAcceptBtn = acceptBtn.cloneNode(true);
        const newDeclineBtn = declineBtn.cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
        declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);

        newAcceptBtn.onclick = () => {
            acceptChallenge(key, data);
            modal.style.display = 'none';
        };
        newDeclineBtn.onclick = () => {
            db.ref(`challenges/${key}`).update({ status: 'declined' });
            modal.style.display = 'none';
        };

        modal.style.display = 'flex';
    }

    // قبول التحدي وإنشاء اللعبة
    async function acceptChallenge(challengeKey, challengeData) {
        const gameRef = db.ref('games').push();
        const gameId = gameRef.key;

        // تحديد من يلعب بالأبيض عشوائياً
        const isChallengerWhite = Math.random() < 0.5;
        const whitePlayer = isChallengerWhite ? challengeData.challengerId : challengeData.opponentId;
        const blackPlayer = isChallengerWhite ? challengeData.opponentId : challengeData.challengerId;

        const gameData = {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            status: 'active',
            whitePlayerId: whitePlayer,
            blackPlayerId: blackPlayer,
            turn: 'w',
            timeControl: challengeData.timeControl,
            whiteTime: challengeData.timeControl * 60, // بالثواني
            blackTime: challengeData.timeControl * 60,
            moves: [],
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await gameRef.set(gameData);
        await db.ref(`challenges/${challengeKey}`).update({ status: 'accepted', gameId: gameId });
        
        window.startGame(gameId);
    }
    
    // ======================= 3. الإعدادات =======================
    const settingsModal = document.getElementById('settings-modal');
    const themeSelect = document.getElementById('theme-select');

    document.getElementById('settings-button').onclick = () => settingsModal.style.display = "flex";
    settingsModal.querySelector('.close-button').onclick = () => settingsModal.style.display = "none";
    
    themeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    });

    document.getElementById('lobby-button').onclick = () => switchView('lobby-view');
});