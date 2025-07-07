// Game state and configuration
const gameState = {
    playerId: null,
    playerName: '',
    gameId: 'ers-game-1',
    players: {},
    currentPlayer: null,
    centerPile: [],
    lastPlayedCards: [],
    lastSlap: null,
    lastSlapValid: false,
    burnPile: [],
    rules: {
        doubles: true,
        sandwich: true,
        marriage: true,
        topBottom: true,
        addsTo10: true,
        runs: true,
        faceCards: true
    },
    gameStarted: false,
    playerOrder: [],
    currentPlayerIndex: 0,
    slapCooldown: false,
    burnInProgress: false,
    faceCardChallenge: {
        active: false,
        faceCard: null,
        attemptsLeft: 0,
        originalPlayer: null
    },
    cleanupInterval: null,
    previousPlayers: {}
};

// DOM elements
const elements = {
    centerPile: document.getElementById('center-pile'),
    playerHand: document.getElementById('player-hand'),
    playerCard: document.getElementById('player-card'),
    playerCount: document.getElementById('player-count'),
    playersList: document.getElementById('players-list'),
    cardCount: document.getElementById('card-count'),
    gameStatus: document.getElementById('game-status'),
    faceCardChallenge: document.getElementById('face-card-challenge'),
    faceCardIndicator: document.getElementById('face-card-indicator'),
    playCardBtn: document.getElementById('play-card'),
    slapBtn: document.getElementById('slap'),
    burnBtn: document.getElementById('burn-card'),
    mobilePlay: document.getElementById('mobile-play'),
    mobileSlap: document.getElementById('mobile-slap'),
    mobileBurn: document.getElementById('mobile-burn'),
    joinModal: document.getElementById('join-modal'),
    winModal: document.getElementById('win-modal'),
    winnerMessage: document.getElementById('winner-message'),
    playerNameInput: document.getElementById('player-name'),
    joinGameBtn: document.getElementById('join-game'),
    playAgainBtn: document.getElementById('play-again'),
    ruleDoubles: document.getElementById('rule-doubles'),
    ruleSandwich: document.getElementById('rule-sandwich'),
    ruleMarriage: document.getElementById('rule-marriage'),
    ruleTopBottom: document.getElementById('rule-top-bottom'),
    ruleAddsTo10: document.getElementById('rule-adds-to-10'),
    ruleRuns: document.getElementById('rule-runs'),
    ruleFaceCards: document.getElementById('rule-face-cards'),
    connectionStatus: document.getElementById('connection-status'),
    systemMessage: document.getElementById('system-message')
};

// Initialize Firebase
const database = firebase.database();

function initFirebase() {
    // Setup presence detection
    const isOfflineForDatabase = {
        state: 'offline',
        lastActive: firebase.database.ServerValue.TIMESTAMP
    };

    const isOnlineForDatabase = {
        state: 'online',
        lastActive: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() === false) {
            elements.connectionStatus.textContent = 'Offline';
            elements.connectionStatus.classList.remove('connected');
            return;
        }

        elements.connectionStatus.textContent = 'Online';
        elements.connectionStatus.classList.add('connected');

        if (gameState.playerId) {
            const playerRef = database.ref(`games/${gameState.gameId}/players/${gameState.playerId}`);
            playerRef.update(isOnlineForDatabase);
            playerRef.onDisconnect().update(isOfflineForDatabase);
            playerRef.onDisconnect().remove().catch(() => {});
        }
    });

    // Listen for game state changes
    database.ref(`games/${gameState.gameId}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Track previous players for disconnect detection
            gameState.previousPlayers = {...gameState.players};
            
            updateGameState(data);
            renderGame();
            checkPlayerChanges();
        }
    });
}

function checkPlayerChanges() {
    // Check for players who left
    Object.keys(gameState.previousPlayers).forEach(playerId => {
        if (!gameState.players[playerId] && playerId !== gameState.playerId) {
            showSystemMessage(`${gameState.previousPlayers[playerId].name} left the game`);
        }
    });

    // Check for new players
    Object.keys(gameState.players).forEach(playerId => {
        if (!gameState.previousPlayers[playerId] && playerId !== gameState.playerId) {
            showSystemMessage(`${gameState.players[playerId].name} joined the game`);
        }
    });
}

function showSystemMessage(message) {
    elements.systemMessage.textContent = message;
    setTimeout(() => {
        elements.systemMessage.textContent = '';
    }, 5000);
}

// Update game state from Firebase data
function updateGameState(data) {
    // Filter out inactive players (lastActive > 60 seconds ago)
    const activePlayers = {};
    const now = Date.now();
    Object.entries(data.players || {}).forEach(([id, player]) => {
        if (!player.lastActive || (now - player.lastActive) < 60000) {
            activePlayers[id] = player;
        }
    });

    // Update all game state
    gameState.players = activePlayers;
    gameState.currentPlayer = data.currentPlayer || null;
    gameState.centerPile = data.centerPile || [];
    gameState.lastPlayedCards = data.lastPlayedCards || [];
    gameState.lastSlap = data.lastSlap || null;
    gameState.lastSlapValid = data.lastSlapValid || false;
    gameState.burnPile = data.burnPile || [];
    gameState.playerOrder = data.playerOrder || [];
    gameState.currentPlayerIndex = data.currentPlayerIndex || 0;
    gameState.gameStarted = data.gameStarted || false;
    gameState.rules = data.rules || gameState.rules;
    gameState.faceCardChallenge = data.faceCardChallenge || {
        active: false,
        faceCard: null,
        attemptsLeft: 0,
        originalPlayer: null
    };
    gameState.burnInProgress = data.burnInProgress || false;

    // Update rules checkboxes
    if (data.rules) {
        elements.ruleDoubles.checked = data.rules.doubles;
        elements.ruleSandwich.checked = data.rules.sandwich;
        elements.ruleMarriage.checked = data.rules.marriage;
        elements.ruleTopBottom.checked = data.rules.topBottom;
        elements.ruleAddsTo10.checked = data.rules.addsTo10;
        elements.ruleRuns.checked = data.rules.runs;
        elements.ruleFaceCards.checked = data.rules.faceCards;
    }
}

function renderGame() {
    const playerCount = Object.keys(gameState.players).length;
    elements.playerCount.textContent = playerCount;
    
    const playersList = Object.values(gameState.players).map(p => 
        p.id === gameState.playerId ? `${p.name} (You)` : p.name
    ).join(', ');
    elements.playersList.textContent = playersList;
    
    // Update center pile
    elements.centerPile.innerHTML = '';
    if (gameState.centerPile.length > 0) {
        const lastCard = gameState.centerPile[gameState.centerPile.length - 1];
        const cardElement = createCardElement(lastCard);
        elements.centerPile.appendChild(cardElement);
    }
    
    // Update player's card count
    if (gameState.playerId && gameState.players[gameState.playerId]) {
        const cardCount = gameState.players[gameState.playerId].cards.length;
        elements.cardCount.textContent = cardCount;
        elements.playerCard.style.display = cardCount > 0 ? 'block' : 'none';
    } else {
        elements.cardCount.textContent = '0';
        elements.playerCard.style.display = 'none';
    }
    
    // Update game status
    if (!gameState.gameStarted) {
        elements.gameStatus.textContent = playerCount >= 2 ? 'Game will start soon...' : 'Waiting for players...';
    } else {
        if (gameState.currentPlayer === gameState.playerId) {
            elements.gameStatus.textContent = 'Your turn!';
        } else {
            const currentPlayerName = gameState.players[gameState.currentPlayer]?.name || 'Another player';
            elements.gameStatus.textContent = `${currentPlayerName}'s turn`;
        }
    }
    
    // Update face card challenge display
    if (gameState.faceCardChallenge.active) {
        const faceCard = gameState.faceCardChallenge.faceCard;
        const attemptsLeft = gameState.faceCardChallenge.attemptsLeft;
        const faceCardName = getCardDisplayName(faceCard);
        
        elements.faceCardIndicator.style.display = 'block';
        elements.faceCardIndicator.textContent = `${faceCardName} - ${attemptsLeft} attempts left`;
        
        if (gameState.currentPlayer === gameState.playerId) {
            elements.faceCardChallenge.textContent = `Challenge: Play a face card in ${attemptsLeft} attempts or lose the pile!`;
        } else {
            elements.faceCardChallenge.textContent = `Face card challenge active (${attemptsLeft} attempts left)`;
        }
    } else {
        elements.faceCardIndicator.style.display = 'none';
        elements.faceCardChallenge.textContent = '';
    }
    
    // Update button states
    const isCurrentPlayer = gameState.currentPlayer === gameState.playerId;
    const hasCards = gameState.playerId && gameState.players[gameState.playerId]?.cards.length > 0;
    
    elements.playCardBtn.disabled = !isCurrentPlayer || !hasCards || gameState.burnInProgress;
    elements.slapBtn.disabled = isCurrentPlayer || !gameState.centerPile.length || gameState.burnInProgress || gameState.faceCardChallenge.active;
    elements.burnBtn.disabled = !gameState.burnInProgress;
    
    elements.mobilePlay.disabled = elements.playCardBtn.disabled;
    elements.mobileSlap.disabled = elements.slapBtn.disabled;
    elements.mobileBurn.disabled = elements.burnBtn.disabled;
    
    checkForWinner();
}

function createCardElement(cardName) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.backgroundImage = `url('cards/${cardName}.png')`;
    return card;
}

function joinGame() {
    const name = elements.playerNameInput.value.trim();
    if (!name) return;
    
    gameState.playerName = name;
    gameState.playerId = generateId();
    
    const playerRef = firebase.database().ref(`games/${gameState.gameId}/players/${gameState.playerId}`);
    playerRef.set({
        id: gameState.playerId,
        name: gameState.playerName,
        cards: []
    });
    
    firebase.database().ref(`games/${gameState.gameId}`).once('value').then(snapshot => {
        if (!snapshot.exists() || !snapshot.val().rules) {
            updateRules();
        }
    });
    
    elements.joinModal.style.display = 'none';
}

function startGame() {
    if (Object.keys(gameState.players).length < 2) return;
    
    const deck = createShuffledDeck();
    const players = Object.keys(gameState.players);
    const playerOrder = [...players].sort(() => Math.random() - 0.5);
    
    const updates = {};
    updates['playerOrder'] = playerOrder;
    updates['currentPlayer'] = playerOrder[0];
    updates['currentPlayerIndex'] = 0;
    updates['gameStarted'] = true;
    
    let currentPlayerIndex = 0;
    while (deck.length > 0) {
        const playerId = playerOrder[currentPlayerIndex];
        const card = deck.pop();
        
        if (!updates[`players/${playerId}/cards`]) {
            updates[`players/${playerId}/cards`] = [];
        }
        updates[`players/${playerId}/cards`].push(card);
        
        currentPlayerIndex = (currentPlayerIndex + 1) % playerOrder.length;
    }
    
    firebase.database().ref(`games/${gameState.gameId}`).update(updates);
}

function createShuffledDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
    
    const deck = [];
    for (const suit of suits) {
        for (const value of values) {
            deck.push(`${value}_of_${suit}`);
        }
    }
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function playCard() {
    if (gameState.currentPlayer !== gameState.playerId || !gameState.players[gameState.playerId]) return;
    
    const player = gameState.players[gameState.playerId];
    if (player.cards.length === 0) return;
    
    const card = player.cards.pop();
    const updates = {};
    updates[`players/${gameState.playerId}/cards`] = player.cards;
    updates['centerPile'] = [...gameState.centerPile, card];
    updates['lastPlayedCards'] = [card];
    
    // Check for face card
    if (gameState.rules.faceCards) {
        const cardValue = getCardValue(card);
        const isFaceCard = ['jack', 'queen', 'king', 'ace'].includes(cardValue);
        
        if (isFaceCard && !gameState.faceCardChallenge.active) {
            // Start face card challenge
            let attempts = 0;
            switch (cardValue) {
                case 'ace': attempts = 4; break;
                case 'king': attempts = 3; break;
                case 'queen': attempts = 2; break;
                case 'jack': attempts = 1; break;
            }
            
            updates['faceCardChallenge'] = {
                active: true,
                faceCard: card,
                attemptsLeft: attempts,
                originalPlayer: gameState.playerId
            };
        } else if (gameState.faceCardChallenge.active) {
            // Continue face card challenge
            const newChallenge = {...gameState.faceCardChallenge};
            newChallenge.attemptsLeft--;
            
            // Check if challenge is met
            if (['jack', 'queen', 'king', 'ace'].includes(cardValue)) {
                // Challenge met - reset and continue
                updates['faceCardChallenge'] = {
                    active: false,
                    faceCard: null,
                    attemptsLeft: 0,
                    originalPlayer: null
                };
            } else if (newChallenge.attemptsLeft <= 0) {
                // Challenge failed - give pile to original player's right
                const originalPlayerIndex = gameState.playerOrder.indexOf(newChallenge.originalPlayer);
                const nextPlayerIndex = (originalPlayerIndex + 1) % gameState.playerOrder.length;
                const nextPlayerId = gameState.playerOrder[nextPlayerIndex];
                
                const nextPlayer = gameState.players[nextPlayerId];
                const newCards = [...nextPlayer.cards, ...gameState.centerPile, card];
                
                // Shuffle the won cards
                for (let i = newCards.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
                }
                
                updates[`players/${nextPlayerId}/cards`] = newCards;
                updates['centerPile'] = [];
                updates['currentPlayer'] = nextPlayerId;
                updates['currentPlayerIndex'] = nextPlayerIndex;
                updates['faceCardChallenge'] = {
                    active: false,
                    faceCard: null,
                    attemptsLeft: 0,
                    originalPlayer: null
                };
                
                firebase.database().ref(`games/${gameState.gameId}`).update(updates);
                return;
            } else {
                updates['faceCardChallenge'] = newChallenge;
            }
        }
    }
    
    // Move to next player
    const nextPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
    const nextPlayerId = gameState.playerOrder[nextPlayerIndex];
    
    updates['currentPlayer'] = nextPlayerId;
    updates['currentPlayerIndex'] = nextPlayerIndex;
    
    firebase.database().ref(`games/${gameState.gameId}`).update(updates);
}

function slapPile() {
    if (gameState.currentPlayer === gameState.playerId || 
        gameState.centerPile.length === 0 ||
        gameState.faceCardChallenge.active) return;
    
    const isValidSlap = checkValidSlap();
    
    const updates = {};
    updates['lastSlap'] = gameState.playerId;
    updates['lastSlapValid'] = isValidSlap;
    
    if (isValidSlap) {
        const winningPlayer = gameState.players[gameState.playerId];
        const newCards = [...winningPlayer.cards, ...gameState.centerPile];
        
        for (let i = newCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
        }
        
        updates[`players/${gameState.playerId}/cards`] = newCards;
        updates['centerPile'] = [];
        updates['currentPlayer'] = gameState.playerId;
        updates['currentPlayerIndex'] = gameState.playerOrder.indexOf(gameState.playerId);
        
        // End any face card challenge
        if (gameState.faceCardChallenge.active) {
            updates['faceCardChallenge'] = {
                active: false,
                faceCard: null,
                attemptsLeft: 0,
                originalPlayer: null
            };
        }
    } else {
        updates['burnInProgress'] = true;
    }
    
    firebase.database().ref(`games/${gameState.gameId}`).update(updates);
}

function checkValidSlap() {
    if (gameState.centerPile.length === 0) return false;
    
    // Check doubles
    if (gameState.rules.doubles && gameState.centerPile.length >= 2) {
        const card1 = gameState.centerPile[gameState.centerPile.length - 1];
        const card2 = gameState.centerPile[gameState.centerPile.length - 2];
        if (getCardValue(card1) === getCardValue(card2)) {
            return true;
        }
    }
    
    // Check sandwich
    if (gameState.rules.sandwich && gameState.centerPile.length >= 3) {
        const card1 = gameState.centerPile[gameState.centerPile.length - 1];
        const card3 = gameState.centerPile[gameState.centerPile.length - 3];
        if (getCardValue(card1) === getCardValue(card3)) {
            return true;
        }
    }
    
    // Check marriage (Q then K or K then Q)
    if (gameState.rules.marriage && gameState.centerPile.length >= 2) {
        const card1 = gameState.centerPile[gameState.centerPile.length - 1];
        const card2 = gameState.centerPile[gameState.centerPile.length - 2];
        const val1 = getCardValue(card1);
        const val2 = getCardValue(card2);
        
        if ((val1 === 'queen' && val2 === 'king') || (val1 === 'king' && val2 === 'queen')) {
            return true;
        }
    }
    
    // Check top and bottom
    if (gameState.rules.topBottom && gameState.centerPile.length >= 2) {
        const firstCard = gameState.centerPile[0];
        const lastCard = gameState.centerPile[gameState.centerPile.length - 1];
        if (getCardValue(firstCard) === getCardValue(lastCard)) {
            return true;
        }
    }
    
    // Check adds to 10
    if (gameState.rules.addsTo10 && gameState.centerPile.length >= 2) {
        const cardValues = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
            'jack': 11, 'queen': 12, 'king': 13, 'ace': 14
        };
        
        // Check last two cards
        const card1 = gameState.centerPile[gameState.centerPile.length - 1];
        const card2 = gameState.centerPile[gameState.centerPile.length - 2];
        const val1 = cardValues[getCardValue(card1)] || 0;
        const val2 = cardValues[getCardValue(card2)] || 0;
        
        if (val1 + val2 === 10) {
            return true;
        }
        
        // Check last three cards (sum of any two)
        if (gameState.centerPile.length >= 3) {
            const card3 = gameState.centerPile[gameState.centerPile.length - 3];
            const val3 = cardValues[getCardValue(card3)] || 0;
            
            if (val1 + val2 === 10 || val1 + val3 === 10 || val2 + val3 === 10) {
                return true;
            }
        }
    }
    
    // Check runs (4 ascending or descending)
    if (gameState.rules.runs && gameState.centerPile.length >= 4) {
        const cardValues = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
            'jack': 11, 'queen': 12, 'king': 13, 'ace': 14
        };
        
        // Get last 4 cards
        const cards = gameState.centerPile.slice(-4);
        const values = cards.map(card => cardValues[getCardValue(card)] || 0);
        
        // Check ascending
        let ascending = true;
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i-1] + 1) {
                ascending = false;
                break;
            }
        }
        
        // Check descending
        let descending = true;
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i-1] - 1) {
                descending = false;
                break;
            }
        }
        
        if (ascending || descending) {
            return true;
        }
    }
    
    return false;
}

function getCardValue(cardName) {
    return cardName.split('_')[0];
}

function getCardDisplayName(cardName) {
    const value = getCardValue(cardName);
    const suit = cardName.split('_')[2].split('.')[0];
    
    const valueNames = {
        '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
        'jack': 'Jack', 'queen': 'Queen', 'king': 'King', 'ace': 'Ace'
    };
    
    const suitNames = {
        'hearts': '♥ Hearts', 'diamonds': '♦ Diamonds', 
        'clubs': '♣ Clubs', 'spades': '♠ Spades'
    };
    
    return `${valueNames[value]} of ${suitNames[suit]}`;
}

function burnCard() {
    if (!gameState.burnInProgress || gameState.lastSlap !== gameState.playerId) return;
    
    const player = gameState.players[gameState.playerId];
    if (player.cards.length === 0) return;
    
    const card = player.cards.pop();
    
    const updates = {};
    updates[`players/${gameState.playerId}/cards`] = player.cards;
    updates['burnPile'] = [...gameState.burnPile, card];
    updates['burnInProgress'] = false;
    
    firebase.database().ref(`games/${gameState.gameId}`).update(updates);
}

function checkForWinner() {
    if (!gameState.gameStarted) return;
    
    const playersWithCards = Object.values(gameState.players).filter(p => p.cards.length > 0);
    
    if (playersWithCards.length === 1) {
        const winner = playersWithCards[0];
        showWinner(winner);
    } else if (playersWithCards.length === 0) {
        showWinner(null);
    }
}

function showWinner(winner) {
    if (!winner) {
        elements.winnerMessage.textContent = "Game ended in a tie!";
    } else {
        const isYou = winner.id === gameState.playerId;
        elements.winnerMessage.textContent = isYou ? 
            "You won the game! Congratulations!" : 
            `${winner.name} won the game!`;
    }
    
    elements.winModal.style.display = 'flex';
}

function playAgain() {
    elements.winModal.style.display = 'none';
    
    if (gameState.playerId) {
        firebase.database().ref(`games/${gameState.gameId}/players/${gameState.playerId}/cards`).set([]);
    }
    
    firebase.database().ref(`games/${gameState.gameId}`).update({
        centerPile: [],
        lastPlayedCards: [],
        lastSlap: null,
        lastSlapValid: false,
        burnPile: [],
        gameStarted: false,
        currentPlayer: null,
        currentPlayerIndex: 0,
        burnInProgress: false,
        faceCardChallenge: {
            active: false,
            faceCard: null,
            attemptsLeft: 0,
            originalPlayer: null
        }
    });
    
    firebase.database().ref(`games/${gameState.gameId}/players`).once('value').then(snapshot => {
        if (Object.keys(snapshot.val() || {}).length >= 2) {
            startGame();
        }
    });
}

function updateRules() {
    const rules = {
        doubles: elements.ruleDoubles.checked,
        sandwich: elements.ruleSandwich.checked,
        marriage: elements.ruleMarriage.checked,
        topBottom: elements.ruleTopBottom.checked,
        addsTo10: elements.ruleAddsTo10.checked,
        runs: elements.ruleRuns.checked,
        faceCards: elements.ruleFaceCards.checked
    };
    
    firebase.database().ref(`games/${gameState.gameId}/rules`).set(rules);
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function setupEventListeners() {
    elements.joinGameBtn.addEventListener('click', joinGame);
    elements.playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });
    
    elements.playCardBtn.addEventListener('click', playCard);
    elements.slapBtn.addEventListener('click', slapPile);
    elements.burnBtn.addEventListener('click', burnCard);
    
    elements.mobilePlay.addEventListener('click', playCard);
    elements.mobileSlap.addEventListener('click', slapPile);
    elements.mobileBurn.addEventListener('click', burnCard);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' || e.key === 'P') {
            playCard();
        } else if (e.key === ' ' && !elements.slapBtn.disabled) {
            slapPile();
        } else if ((e.key === 'b' || e.key === 'B') && !elements.burnBtn.disabled) {
            burnCard();
        }
    });
    
    elements.ruleDoubles.addEventListener('change', updateRules);
    elements.ruleSandwich.addEventListener('change', updateRules);
    elements.ruleMarriage.addEventListener('change', updateRules);
    elements.ruleTopBottom.addEventListener('change', updateRules);
    elements.ruleAddsTo10.addEventListener('change', updateRules);
    elements.ruleRuns.addEventListener('change', updateRules);
    elements.ruleFaceCards.addEventListener('change', updateRules);
    
    elements.playAgainBtn.addEventListener('click', playAgain);
    
    elements.joinModal.style.display = 'flex';
}

function init() {
    initFirebase();
    setupEventListeners();
    
    firebase.database().ref(`games/${gameState.gameId}/players`).on('value', (snapshot) => {
        const players = snapshot.val() || {};
        if (Object.keys(players).length >= 2 && !gameState.gameStarted) {
            startGame();
        }
    });
}

// Add player activity tracking
function trackActivity() {
    if (gameState.playerId && gameState.gameStarted) {
        database.ref(`games/${gameState.gameId}/players/${gameState.playerId}/lastActive`)
            .set(firebase.database.ServerValue.TIMESTAMP);
    }
}

// Initialize the game
function init() {
    initFirebase();
    setupEventListeners();
    
    // Set up periodic activity tracking
    setInterval(trackActivity, 10000);
    
    // Set up periodic cleanup
    gameState.cleanupInterval = setInterval(() => {
        database.ref(`games/${gameState.gameId}/players`).once('value').then(snapshot => {
            const players = snapshot.val() || {};
            const now = Date.now();
            
            Object.keys(players).forEach(playerId => {
                if (now - (players[playerId].lastActive || 0) > 60000) {
                    database.ref(`games/${gameState.gameId}/players/${playerId}`).remove();
                }
            });
        });
    }, 30000);
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (gameState.playerId) {
            database.ref(`games/${gameState.gameId}/players/${gameState.playerId}`).remove();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
