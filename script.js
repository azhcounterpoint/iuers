// Firebase configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Game state
let gameState = {
    players: {},
    centerPile: [],
    currentPlayer: null,
    gameStarted: false,
    challenge: null,
    challengeCount: 0,
    lastSlap: null,
    winner: null
};

let playerId = null;
let playerName = '';
let playerRef = null;
let gameRef = null;

// DOM elements
const joinGameBtn = document.getElementById('join-game');
const startGameBtn = document.getElementById('start-game');
const slapBtn = document.getElementById('slap-btn');
const playCardBtn = document.getElementById('play-card');
const playerNameInput = document.getElementById('player-name');
const playerCountDisplay = document.getElementById('player-count');
const gameStatusDisplay = document.getElementById('game-status');
const gameMessageDisplay = document.getElementById('game-message');
const centerPileDisplay = document.getElementById('center-pile');

// Event listeners
joinGameBtn.addEventListener('click', joinGame);
startGameBtn.addEventListener('click', startGame);
slapBtn.addEventListener('click', slapPile);
playCardBtn.addEventListener('click', playCard);

// Join game function
function joinGame() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    playerName = name;
    playerId = 'player_' + Date.now();
    
    // Create player reference
    playerRef = database.ref('players/' + playerId);
    
    // Set player data
    playerRef.set({
        name: playerName,
        cards: [],
        ready: false,
        slapAttempt: false
    });
    
    // Listen for game state changes
    gameRef = database.ref('game');
    gameRef.on('value', snapshot => {
        gameState = snapshot.val() || gameState;
        updateUI();
    });
    
    // Disable join controls
    playerNameInput.disabled = true;
    joinGameBtn.disabled = true;
    
    // Enable ready button
    startGameBtn.disabled = false;
}

// Start game function
function startGame() {
    playerRef.update({ ready: true });
    startGameBtn.disabled = true;
}

// Play card function
function playCard() {
    if (gameState.currentPlayer !== playerId || !gameState.gameStarted) return;
    
    if (gameState.challenge && gameState.challenge.player === playerId) {
        // Player is in a challenge
        if (gameState.challenge.count > 0) {
            // Still need to play more cards for the challenge
            playChallengeCard();
            return;
        }
    }
    
    // Normal card play
    playerRef.once('value', snapshot => {
        const player = snapshot.val();
        if (player.cards.length === 0) return;
        
        const card = player.cards[0];
        const newCards = player.cards.slice(1);
        
        // Update player's cards
        playerRef.update({ cards: newCards });
        
        // Add card to center pile
        const newCenterPile = [...gameState.centerPile, card];
        
        // Check for face card
        let challenge = null;
        if (['J', 'Q', 'K', 'A'].includes(card.value)) {
            const counts = { 'J': 1, 'Q': 2, 'K': 3, 'A': 4 };
            challenge = {
                player: playerId,
                count: counts[card.value],
                requiredValue: card.value
            };
        }
        
        // Update game state
        const nextPlayer = getNextPlayer();
        gameRef.update({
            centerPile: newCenterPile,
            currentPlayer: nextPlayer,
            challenge: challenge,
            challengeCount: challenge ? 0 : null,
            lastSlap: null
        });
        
        // Check for slap opportunities
        checkSlapOpportunity(newCenterPile);
    });
}

// Play challenge card function
function playChallengeCard() {
    playerRef.once('value', snapshot => {
        const player = snapshot.val();
        if (player.cards.length === 0) {
            // Player has no cards left - challenge failed
            endChallenge(false);
            return;
        }
        
        const card = player.cards[0];
        const newCards = player.cards.slice(1);
        
        // Update player's cards
        playerRef.update({ cards: newCards });
        
        // Add card to center pile
        const newCenterPile = [...gameState.centerPile, card];
        
        // Update challenge count
        const newChallengeCount = gameState.challengeCount + 1;
        
        // Check if challenge is complete
        if (newChallengeCount >= gameState.challenge.count) {
            // Challenge complete - no face card played
            endChallenge(true);
            return;
        }
        
        // Check if another face card was played
        if (['J', 'Q', 'K', 'A'].includes(card.value)) {
            // New face card - challenge continues with new requirements
            const counts = { 'J': 1, 'Q': 2, 'K': 3, 'A': 4 };
            const challenge = {
                player: playerId,
                count: counts[card.value],
                requiredValue: card.value
            };
            
            gameRef.update({
                centerPile: newCenterPile,
                challenge: challenge,
                challengeCount: 0
            });
        } else {
            // Regular card - continue challenge
            gameRef.update({
                centerPile: newCenterPile,
                challengeCount: newChallengeCount
            });
        }
        
        // Check for slap opportunities
        checkSlapOpportunity(newCenterPile);
    });
}

// End challenge function
function endChallenge(success) {
    const challenge = gameState.challenge;
    const winningPlayer = success ? challenge.player : getNextPlayer(challenge.player);
    
    // Give the pile to the winning player
    givePileToPlayer(winningPlayer);
    
    // Update game state
    const nextPlayer = getNextPlayer(winningPlayer);
    gameRef.update({
        currentPlayer: nextPlayer,
        centerPile: [],
        challenge: null,
        challengeCount: null,
        lastSlap: null
    });
}

// Slap pile function
function slapPile() {
    if (!gameState.gameStarted || !canSlap()) return;
    
    // Mark slap attempt
    playerRef.update({ slapAttempt: true });
    
    // Check if slap is valid
    const isValid = checkValidSlap(gameState.centerPile);
    
    if (isValid) {
        // Give pile to player
        givePileToPlayer(playerId);
        
        // Update game state
        const nextPlayer = getNextPlayer();
        gameRef.update({
            centerPile: [],
            currentPlayer: nextPlayer,
            challenge: null,
            challengeCount: null,
            lastSlap: {
                player: playerId,
                valid: true
            }
        });
    } else {
        // Penalty for invalid slap
        penalizePlayer(playerId);
        
        gameRef.update({
            lastSlap: {
                player: playerId,
                valid: false
            }
        });
    }
}

// Helper functions
function getNextPlayer(current = gameState.currentPlayer) {
    const playerIds = Object.keys(gameState.players);
    if (playerIds.length === 0) return null;
    
    const currentIndex = playerIds.indexOf(current);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    return playerIds[nextIndex];
}

function checkSlapOpportunity(pile) {
    if (pile.length < 2) return false;
    
    // Check for doubles
    const lastCard = pile[pile.length - 1];
    const secondLastCard = pile[pile.length - 2];
    
    if (lastCard.value === secondLastCard.value) {
        return true;
    }
    
    // Check for sandwiches (if pile has at least 3 cards)
    if (pile.length >= 3) {
        const thirdLastCard = pile[pile.length - 3];
        if (lastCard.value === thirdLastCard.value) {
            return true;
        }
    }
    
    return false;
}

function canSlap() {
    // Can't slap if it's your turn (unless you're in a challenge)
    if (gameState.currentPlayer === playerId && !gameState.challenge) return false;
    
    // Can't slap if you already attempted
    if (gameState.lastSlap && gameState.lastSlap.player === playerId) return false;
    
    // Must have cards to win
    const player = gameState.players[playerId];
    if (!player || player.cards.length === 0) return false;
    
    return true;
}

function checkValidSlap(pile) {
    if (pile.length < 2) return false;
    
    // Check for doubles
    const lastCard = pile[pile.length - 1];
    const secondLastCard = pile[pile.length - 2];
    
    if (lastCard.value === secondLastCard.value) {
        return true;
    }
    
    // Check for sandwiches (if pile has at least 3 cards)
    if (pile.length >= 3) {
        const thirdLastCard = pile[pile.length - 3];
        if (lastCard.value === thirdLastCard.value) {
            return true;
        }
    }
    
    return false;
}

function givePileToPlayer(playerId) {
    if (!gameState.centerPile.length) return;
    
    const playerRef = database.ref('players/' + playerId);
    playerRef.once('value', snapshot => {
        const player = snapshot.val();
        const newCards = [...player.cards, ...gameState.centerPile];
        
        // Shuffle the new cards (optional)
        shuffleArray(newCards);
        
        playerRef.update({ cards: newCards });
    });
}

function penalizePlayer(playerId) {
    const playerRef = database.ref('players/' + playerId);
    playerRef.once('value', snapshot => {
        const player = snapshot.val();
        if (player.cards.length === 0) return;
        
        // Take one card from the player and add to bottom of another player's deck
        const penaltyCard = player.cards[0];
        const newCards = player.cards.slice(1);
        
        // Find another player to give the card to
        const otherPlayerIds = Object.keys(gameState.players).filter(id => id !== playerId);
        if (otherPlayerIds.length === 0) return;
        
        const randomPlayerId = otherPlayerIds[Math.floor(Math.random() * otherPlayerIds.length)];
        const otherPlayerRef = database.ref('players/' + randomPlayerId);
        
        otherPlayerRef.once('value', otherSnapshot => {
            const otherPlayer = otherSnapshot.val();
            const otherNewCards = [...otherPlayer.cards, penaltyCard];
            otherPlayerRef.update({ cards: otherNewCards });
        });
        
        playerRef.update({ cards: newCards });
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function updateUI() {
    // Update player count
    const playerCount = Object.keys(gameState.players).length;
    playerCountDisplay.textContent = `Players: ${playerCount}`;
    
    // Update game status
    if (gameState.winner) {
        const winnerName = gameState.players[gameState.winner]?.name || 'Unknown';
        gameStatusDisplay.textContent = `Game Over! ${winnerName} wins!`;
    } else if (gameState.gameStarted) {
        const currentPlayerName = gameState.players[gameState.currentPlayer]?.name || 'Unknown';
        gameStatusDisplay.textContent = `Current Turn: ${currentPlayerName}`;
        
        if (gameState.challenge) {
            const challengePlayerName = gameState.players[gameState.challenge.player]?.name || 'Unknown';
            gameStatusDisplay.textContent += ` | Challenge: ${challengePlayerName} needs to play ${gameState.challenge.count - gameState.challengeCount} more cards`;
        }
    } else {
        const readyPlayers = Object.values(gameState.players).filter(p => p.ready).length;
        gameStatusDisplay.textContent = `Waiting for players... (${readyPlayers}/${playerCount} ready)`;
        
        // Enable start button if at least 2 players are ready and you're the first player
        if (playerCount >= 2 && readyPlayers >= 2) {
            const playerIds = Object.keys(gameState.players);
            if (playerIds[0] === playerId) {
                startGameBtn.disabled = false;
            }
        }
    }
    
    // Update player areas
    updatePlayerAreas();
    
    // Update center pile
    updateCenterPile();
    
    // Update game message
    updateGameMessage();
    
    // Update button states
    updateButtonStates();
}

function updatePlayerAreas() {
    // Clear all player areas
    document.querySelectorAll('.player-area').forEach(area => {
        area.classList.remove('current-player');
        area.querySelector('.player-name').textContent = 'Waiting...';
        area.querySelector('.player-cards').textContent = 'Cards: 0';
        
        const slots = area.querySelectorAll('.card-slot');
        slots[0].innerHTML = '';
        slots[1].innerHTML = '';
    });
    
    // Update each player's area
    Object.entries(gameState.players).forEach(([id, player], index) => {
        const area = document.getElementById(`player${index + 1}-area`);
        if (!area) return;
        
        area.querySelector('.player-name').textContent = player.name;
        area.querySelector('.player-cards').textContent = `Cards: ${player.cards.length}`;
        
        // Show top cards
        const slots = area.querySelectorAll('.card-slot');
        if (player.cards.length > 0) {
            createCardElement(player.cards[0], slots[0]);
        }
        if (player.cards.length > 1) {
            createCardElement(player.cards[1], slots[1]);
        }
        
        // Highlight current player
        if (id === gameState.currentPlayer) {
            area.classList.add('current-player');
        }
        
        // Highlight winner
        if (id === gameState.winner) {
            area.classList.add('winner');
        }
    });
}

function updateCenterPile() {
    centerPileDisplay.innerHTML = '';
    
    if (gameState.centerPile.length === 0) return;
    
    // Show top card of the pile
    const topCard = gameState.centerPile[gameState.centerPile.length - 1];
    createCardElement(topCard, centerPileDisplay);
}

function updateGameMessage() {
    if (gameState.lastSlap) {
        const playerName = gameState.players[gameState.lastSlap.player]?.name || 'Unknown';
        if (gameState.lastSlap.valid) {
            gameMessageDisplay.textContent = `${playerName} slapped successfully and won the pile!`;
        } else {
            gameMessageDisplay.textContent = `${playerName} slapped incorrectly and lost a card!`;
        }
    } else if (gameState.challenge) {
        const playerName = gameState.players[gameState.challenge.player]?.name || 'Unknown';
        gameMessageDisplay.textContent = `${playerName} must play ${gameState.challenge.count - gameState.challengeCount} more cards!`;
    } else {
        gameMessageDisplay.textContent = '';
    }
}

function updateButtonStates() {
    // Play card button
    playCardBtn.disabled = !gameState.gameStarted || gameState.currentPlayer !== playerId || gameState.winner;
    
    // Slap button
    slapBtn.disabled = !gameState.gameStarted || !canSlap() || gameState.winner;
}

function createCardElement(card, container) {
    if (!card) return;
    
    const cardElement = document.createElement('div');
    cardElement.className = 'card ' + (['♥', '♦'].includes(card.suit) ? 'red' : 'black');
    
    cardElement.innerHTML = `
        <div class="card-corner top-left">${card.value}</div>
        <div class="card-suit">${card.suit}</div>
        <div class="card-value">${card.value}</div>
        <div class="card-corner bottom-right">${card.value}</div>
    `;
    
    container.appendChild(cardElement);
}

// Initialize game when enough players are ready
gameRef?.child('players').on('value', snapshot => {
    const players = snapshot.val() || {};
    const readyPlayers = Object.values(players).filter(p => p.ready).length;
    
    if (readyPlayers >= 2 && !gameState.gameStarted) {
        // Initialize game
        initializeGame();
    }
});

function initializeGame() {
    // Create a standard deck of cards
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }
    
    // Shuffle the deck
    shuffleArray(deck);
    
    // Distribute cards to players
    const players = gameState.players;
    const playerIds = Object.keys(players);
    
    playerIds.forEach((id, index) => {
        const playerCards = deck.slice(index * 26, (index + 1) * 26);
        database.ref('players/' + id).update({ 
            cards: playerCards,
            slapAttempt: false
        });
    });
    
    // Set first player
    const firstPlayer = playerIds[0];
    
    // Update game state
    gameRef.update({
        gameStarted: true,
        currentPlayer: firstPlayer,
        centerPile: [],
        challenge: null,
        challengeCount: null,
        lastSlap: null,
        winner: null
    });
}

// Check for winner periodically
setInterval(() => {
    if (!gameState.gameStarted || gameState.winner) return;
    
    const players = gameState.players;
    const playerIds = Object.keys(players);
    
    // Check if any player has all the cards
    for (const id of playerIds) {
        const totalCards = players[id].cards.length;
        let otherPlayersCards = 0;
        
        for (const otherId of playerIds) {
            if (otherId !== id) {
                otherPlayersCards += players[otherId].cards.length;
            }
        }
        
        if (totalCards > 0 && otherPlayersCards === 0) {
            // This player has won
            gameRef.update({ winner: id });
            break;
        }
    }
}, 1000);
