// game.js
// يعتمد على: db, currentUserId, switchView, initialFEN (من index.html/app.js)

const chessboardElement = document.getElementById('chessboard');

// الرموز النصية للقطع (Unicode Chess Symbols)
const unicodePieces = {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
};

let selectedSquare = null; // لتخزين المربع المختار

/** إنشاء وعرض لوحة الشطرنج بناءً على حالة FEN */
function renderBoard(fen) {
    chessboardElement.innerHTML = '';
    const piecesPlacement = fen.split(' ')[0];
    const ranks = piecesPlacement.split('/'); 
    
    let row = 0;
    for (const rank of ranks) {
        let col = 0;
        for (let i = 0; i < rank.length; i++) {
            const char = rank[i];
            
            if (!isNaN(parseInt(char))) {
                const emptySquares = parseInt(char);
                for (let j = 0; j < emptySquares; j++) {
                    createSquare(row, col, null);
                    col++;
                }
            } else {
                createSquare(row, col, char);
                col++;
            }
        }
        row++;
    }
}

/** إنشاء مربع واحد */
function createSquare(row, col, pieceChar) {
    const square = document.createElement('div');
    const isDark = (row + col) % 2 === 0;
    square.className = `square ${isDark ? 'dark' : 'light'}`;
    
    if (pieceChar) {
        const pieceElement = document.createElement('span');
        const isWhite = pieceChar === pieceChar.toUpperCase();
        pieceElement.className = `piece ${isWhite ? 'white' : 'black'}`;
        pieceElement.textContent = unicodePieces[pieceChar];
        square.appendChild(pieceElement);
    }

    // تعيين الإحداثيات المنطقية (مثل: a8, h1)
    square.dataset.coords = String.fromCharCode(97 + col) + (8 - row); 
    square.onclick = handleSquareClick;

    chessboardElement.appendChild(square);
}

/** معالج النقر على المربعات */
function handleSquareClick(event) {
    if (!currentUserId || !currentGameId) {
        alert('المباراة غير نشطة أو تحتاج لتسجيل الدخول.');
        return;
    }
    
    const square = event.currentTarget;
    const coords = square.dataset.coords;
    
    // إزالة التحديد السابق
    document.querySelectorAll('.square').forEach(s => s.classList.remove('selected'));

    if (selectedSquare === coords) {
        // إلغاء التحديد
        selectedSquare = null;
    } else if (selectedSquare) {
        // محاولة تحريك القطعة (مثلاً: e2e4)
        const move = selectedSquare + coords;
        console.log(`محاولة إرسال الحركة: ${move}`);
        
        // ** ملاحظة: هنا يجب أن يتم التحقق من الحركة بواسطة Cloud Functions **
        // في هذا الإصدار، نقوم فقط بإرسال الحركة، معتمدين على قواعد الأمان لتناوب الأدوار.
        
        sendMoveToFirebase(move);
        selectedSquare = null;
        
    } else if (square.querySelector('.piece')) {
        // تحديد قطعة جديدة
        square.classList.add('selected');
        selectedSquare = coords;
        console.log(`تم تحديد المربع: ${coords}`);
    }
}

/** إرسال الحركة إلى قاعدة بيانات Firebase */
function sendMoveToFirebase(moveNotation) {
    if (!currentGameId) return;

    const gameRef = db.ref('games/' + currentGameId);
    
    // قراءة البيانات الحالية لتحديد الدور وFEN
    gameRef.once('value', (snapshot) => {
        const gameData = snapshot.val();
        
        if (gameData.turn !== currentUserId) {
            alert('انتظر دورك للعب!');
            return;
        }

        // تحديث FEN و Moves بشكل افتراضي (يجب أن يتم التحقق من صحة FEN عبر Cloud Functions)
        // بما أننا لا نستخدم Cloud Functions هنا، سنقوم فقط بإضافة الحركة إلى القائمة
        
        const updatedMoves = [...gameData.moves, moveNotation];
        
        // تحديث FEN والدور (هنا تحتاج إلى محرك شطرنج JavaScript في الواجهة الأمامية)
        // بما أننا لا نستخدم محرك شطرنج هنا، لا يمكننا تحديث FEN أو الدور بشكل صحيح
        
        gameRef.update({
            // fen: NEW_FEN_FROM_MOVE, // يتطلب محرك شطرنج
            // turn: NEXT_PLAYER_ID, // يتطلب محرك شطرنج
            moves: updatedMoves 
        })
        .catch(error => alert('فشل إرسال الحركة.'));

        document.getElementById('game-status-message').textContent = 'جاري التحقق من الحركة...';
    });
}


// ==================================================
// وظائف إدارة حالة اللعبة والتبديل
// ==================================================

/** دالة بدء اللعبة: يتم استدعاؤها بعد قبول التحدي */
window.startGame = function(gameId) {
    currentGameId = gameId;
    window.switchView('game-view'); // **التبديل لشاشة اللعب**
    syncGameFromFirebase(gameId);
};

/** مزامنة حالة اللوحة من Firebase */
function syncGameFromFirebase(gameId) {
    db.ref('games/' + gameId).on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;
        
        renderBoard(gameData.fen); 

        const isWhite = currentUserId === gameData.playerWhiteId;
        const opponentId = isWhite ? gameData.playerBlackId : gameData.playerWhiteId;
        
        db.ref('users/' + opponentId).once('value', (snap) => {
             document.getElementById('opponent-name').textContent = `الخصم: ${snap.val().email.split('@')[0]} (${snap.val().rating || '1200'})`;
        });
        
        document.getElementById('game-time-control').textContent = `${gameData.timeControl / 60} دقائق`;
        document.getElementById('game-status-message').textContent = 
            gameData.turn === currentUserId ? 'دورك للعب!' : 'انتظر حركة الخصم.';
    });
}

// تفعيل زر الاستسلام
document.getElementById('resign-button').onclick = () => {
    if (!currentGameId || !confirm('هل أنت متأكد من الاستسلام؟ ستخسر المباراة.')) return;
    
    // مطلوب: تحديث حالة اللعبة إلى 'resigned'
    db.ref('games/' + currentGameId).update({ 
        status: 'resigned',
        winnerId: currentUserId === db.ref('games/' + currentGameId + '/playerWhiteId').val() ? db.ref('games/' + currentGameId + '/playerBlackId').val() : db.ref('games/' + currentGameId + '/playerWhiteId').val()
    });
    alert('تم الاستسلام بنجاح. سيتم العودة إلى الردهة.');
    db.ref('games/' + currentGameId).off(); // إيقاف المزامنة
    window.switchView('lobby-view'); 
    currentGameId = null;
};

// تشغيل اللوح الأولي عند تحميل الملف
renderBoard(initialFEN);