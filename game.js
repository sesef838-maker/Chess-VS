// game.js
document.addEventListener('DOMContentLoaded', () => {

    const chessboardElement = document.getElementById('chessboard');
    const gameStatusMessage = document.getElementById('game-status-message');
    const opponentNameDisplay = document.getElementById('opponent-name');
    
    let chess = new Chess(); // ♛ إنشاء نسخة من محرك الشطرنج ♛
    let selectedSquare = null;
    let playerColor = null;
    let gameRef = null;

    const pieceSymbols = { 'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚' };

    // ======================= 1. عرض اللوحة =======================
    function renderBoard() {
        chessboardElement.innerHTML = '';
        const board = chess.board(); // الحصول على مصفوفة اللوحة من chess.js

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const rank = playerColor === 'w' ? i : 7 - i;
                const file = playerColor === 'w' ? j : 7 - j;
                
                const squareData = board[rank][file];
                const square = document.createElement('div');
                const isDark = (rank + file) % 2 !== 0;
                square.className = `square ${isDark ? 'dark' : 'light'}`;
                
                const algebraic = String.fromCharCode(97 + file) + (8 - rank);
                square.dataset.square = algebraic;

                if (squareData) {
                    const piece = document.createElement('span');
                    piece.className = `piece ${squareData.color === 'w' ? 'white' : 'black'}`;
                    piece.textContent = pieceSymbols[squareData.type];
                    square.appendChild(piece);
                }
                square.addEventListener('click', handleSquareClick);
                chessboardElement.appendChild(square);
            }
        }
    }
    
    // ======================= 2. منطق اللعب =======================
    function handleSquareClick(e) {
        const square = e.currentTarget.dataset.square;

        // التحقق من أنه دور اللاعب
        if (chess.turn() !== playerColor) {
            return;
        }

        if (selectedSquare) {
            // محاولة تنفيذ نقلة
            const move = {
                from: selectedSquare,
                to: square,
                promotion: 'q' // الترقية لوزير افتراضياً
            };
            
            const result = chess.move(move);
            if (result) {
                // النقلة صحيحة، أرسلها إلى Firebase
                sendMoveToFirebase(result);
            }
            
            // إلغاء التحديد في كل الحالات
            selectedSquare = null;
            clearHighlights();
        } else {
            // تحديد قطعة
            const piece = chess.get(square);
            if (piece && piece.color === playerColor) {
                selectedSquare = square;
                highlightPossibleMoves(square);
            }
        }
    }

    function highlightPossibleMoves(square) {
        clearHighlights();
        const moves = chess.moves({ square: square, verbose: true });
        
        document.querySelector(`[data-square="${square}"]`).classList.add('selected');

        moves.forEach(move => {
            document.querySelector(`[data-square="${move.to}"]`).classList.add('possible-move');
        });
    }

    function clearHighlights() {
        document.querySelectorAll('.square').forEach(s => s.classList.remove('selected', 'possible-move'));
    }

    // ======================= 3. الاتصال بـ Firebase =======================
    function sendMoveToFirebase(move) {
        if (!gameRef) return;
        gameRef.update({
            fen: chess.fen(),
            turn: chess.turn(),
            lastMove: { from: move.from, to: move.to }
        });
    }

    window.startGame = function(gameId) {
        currentGameId = gameId;
        gameRef = db.ref('games/' + gameId);
        switchView('game-view');
        syncGame();
    };

    function syncGame() {
        gameRef.on('value', (snapshot) => {
            const gameData = snapshot.val();
            if (!gameData) return;

            // تحديد لون اللاعب
            playerColor = (currentUserId === gameData.whitePlayerId) ? 'w' : 'b';

            // تحميل حالة اللعبة
            chess.load(gameData.fen);
            renderBoard();

            updateGameInfo(gameData);
            updateStatusMessage();
        });
    }

    function updateGameInfo(gameData) {
        const opponentId = playerColor === 'w' ? gameData.blackPlayerId : gameData.whitePlayerId;
        db.ref(`users/${opponentId}`).once('value', snap => {
            opponentNameDisplay.textContent = `${sanitizeInput(snap.val().username)} (${snap.val().rating})`;
        });
        // هنا يمكن إضافة منطق تحديث الساعات
    }

    function updateStatusMessage() {
        let message = '';
        if (chess.game_over()) {
            if (chess.in_checkmate()) {
                message = `كش ملك! ${chess.turn() === 'w' ? 'الأسود' : 'الأبيض'} فاز.`;
            } else if (chess.in_draw()) {
                message = 'انتهت المباراة بالتعادل.';
            }
        } else {
            message = (chess.turn() === playerColor) ? 'دورك في اللعب' : 'في انتظار حركة الخصم...';
            if (chess.in_check()) {
                message += ' (كش ملك!)';
                gameStatusMessage.classList.add('check');
            } else {
                gameStatusMessage.classList.remove('check');
            }
        }
        gameStatusMessage.textContent = message;
    }
    
    // زر الاستسلام
    document.getElementById('resign-button').onclick = () => {
        if (gameRef && confirm('هل أنت متأكد من رغبتك في الاستسلام؟')) {
            const winner = playerColor === 'w' ? 'black' : 'white';
            gameRef.update({ status: 'resigned', winner: winner });
            gameRef.off(); // إيقاف المزامنة
            switchView('lobby-view');
        }
    };
});