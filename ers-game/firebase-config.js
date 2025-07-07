const firebaseConfig = {
  apiKey: "AIzaSyAV0ZgEYMupAu9b8xZRuNV00HUouElztrw",
  authDomain: "iupaers.firebaseapp.com",
  databaseURL: "https://iupaers-default-rtdb.firebaseio.com",
  projectId: "iupaers",
  storageBucket: "iupaers.firebasestorage.app",
  messagingSenderId: "988099496172",
  appId: "1:988099496172:web:2a8a39ebe6c7d2ac257dc9"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Presence detection setup
const database = firebase.database();
const isOfflineForDatabase = {
  state: 'offline',
  lastActive: firebase.database.ServerValue.TIMESTAMP
};

const isOnlineForDatabase = {
  state: 'online',
  lastActive: firebase.database.ServerValue.TIMESTAMP
};

// Listen for connection state
database.ref('.info/connected').on('value', (snapshot) => {
  if (snapshot.val() === false) {
    return;
  }
  
  // When we disconnect, we'll set the player to offline
  if (typeof gameState !== 'undefined' && gameState.playerId) {
    const playerRef = database.ref(`games/${gameState.gameId}/players/${gameState.playerId}`);
    playerRef.onDisconnect().update(isOfflineForDatabase);
    playerRef.onDisconnect().remove().catch(() => {});
  }
});
