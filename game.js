const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const startBtn = document.getElementById('startBtn');
const gunText = document.getElementById('gunText');
const shieldText = document.getElementById('shieldText');
const shieldTimer = document.getElementById('shieldTimer');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// Game constants
const GRID_SIZE = 30;
const CELL_SIZE = 20;
let GAME_SPEED = 100;
const PROJECTILE_SPEED = 1.5; // Projectiles move 3x faster than snake
const ENEMY_SPAWN_DELAY = 5000; // Spawn new enemy every 5 seconds
const MAX_ENEMIES = 5;
const COUNTDOWN_START = 3000; // Start countdown 3 seconds before spawn
const SHIELD_DURATION = 1000; // Shield lasts 1 second
const SHIELD_COOLDOWN = 5000; // Shield cooldown 5 seconds
const SHIELD_ACTIVATION_TIME = 500; // Hold for 0.5 seconds to activate shield

// Predefined entry points
const ENTRY_POINTS = [
    // Top edge
    { x: 5, y: 0, dir: { x: 0, y: 1 } },
    { x: 15, y: 0, dir: { x: 0, y: 1 } },
    { x: 25, y: 0, dir: { x: 0, y: 1 } },
    // Bottom edge
    { x: 5, y: GRID_SIZE - 1, dir: { x: 0, y: -1 } },
    { x: 15, y: GRID_SIZE - 1, dir: { x: 0, y: -1 } },
    { x: 25, y: GRID_SIZE - 1, dir: { x: 0, y: -1 } },
    // Left edge
    { x: 0, y: 5, dir: { x: 1, y: 0 } },
    { x: 0, y: 15, dir: { x: 1, y: 0 } },
    { x: 0, y: 25, dir: { x: 1, y: 0 } },
    // Right edge
    { x: GRID_SIZE - 1, y: 5, dir: { x: -1, y: 0 } },
    { x: GRID_SIZE - 1, y: 15, dir: { x: -1, y: 0 } },
    { x: GRID_SIZE - 1, y: 25, dir: { x: -1, y: 0 } }
];

// Sound system
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(frequency, duration, type = 'sine') {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
}

function playShootSound() {
    playSound(800, 0.1, 'square');
}

function playFoodSound() {
    playSound(400, 0.1);
    setTimeout(() => playSound(600, 0.1), 50);
    setTimeout(() => playSound(800, 0.1), 100);
}

function playExplosionSound() {
    playSound(150, 0.3, 'sawtooth');
    setTimeout(() => playSound(100, 0.2, 'sawtooth'), 100);
}

function playCollisionSound() {
    playSound(200, 0.4, 'triangle');
}

// Set canvas size (extra large map)
canvas.width = GRID_SIZE * CELL_SIZE;
canvas.height = GRID_SIZE * CELL_SIZE;

// Game state
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = {};
let projectiles = [];
let enemySnakes = [];
let explosions = [];
let collisionMarkers = [];
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameRunning = false;
let gameLoop = null;
let lastEnemySpawn = 0;
let nextSpawnPoint = null;
let spawnCountdown = 0;
let shieldActive = false;
let shieldEndTime = 0;
let shieldCooldownEnd = 0;
let spaceKeyDown = false;
let spaceKeyHoldStart = 0;
let gunFlashEnd = 0;
let shieldActivationTimer = null;

// Initialize game
function init() {
    snake = [
        { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) },
        { x: Math.floor(GRID_SIZE / 2) - 1, y: Math.floor(GRID_SIZE / 2) },
        { x: Math.floor(GRID_SIZE / 2) - 2, y: Math.floor(GRID_SIZE / 2) }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    projectiles = [];
    enemySnakes = [];
    explosions = [];
    collisionMarkers = [];
    score = 0;
    lastEnemySpawn = Date.now();
    shieldActive = false;
    shieldEndTime = 0;
    shieldCooldownEnd = 0;
    spaceKeyDown = false;
    spaceKeyHoldStart = 0;
    gunFlashEnd = 0;
    if (shieldActivationTimer) {
        clearTimeout(shieldActivationTimer);
        shieldActivationTimer = null;
    }
    updateScore();
    highScoreElement.textContent = highScore;
    generateFood();
    gameRunning = true;
}

// Generate food at random position
function generateFood() {
    do {
        food = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE)
        };
    } while (snake.some(segment => segment.x === food.x && segment.y === food.y) ||
             enemySnakes.some(enemy => enemy.segments.some(segment => segment.x === food.x && segment.y === food.y)));
}

// Spawn enemy snake
function spawnEnemySnake() {
    if (enemySnakes.length >= MAX_ENEMIES || !nextSpawnPoint) return;
    
    const spawn = nextSpawnPoint;
    
    enemySnakes.push({
        segments: [
            { x: spawn.x, y: spawn.y },
            { x: spawn.x - spawn.dir.x, y: spawn.y - spawn.dir.y },
            { x: spawn.x - spawn.dir.x * 2, y: spawn.y - spawn.dir.y * 2 }
        ],
        direction: spawn.dir,
        color: '#ffffff'
    });
    
    nextSpawnPoint = null;
    spawnCountdown = 0;
}

// Get next spawn point
function selectNextSpawnPoint() {
    // Filter out occupied entry points
    const availablePoints = ENTRY_POINTS.filter(point => {
        // Check if player snake is near
        if (snake.some(segment => 
            Math.abs(segment.x - point.x) < 3 && 
            Math.abs(segment.y - point.y) < 3)) {
            return false;
        }
        // Check if enemy snake is near
        if (enemySnakes.some(enemy => 
            enemy.segments.some(segment => 
                Math.abs(segment.x - point.x) < 3 && 
                Math.abs(segment.y - point.y) < 3))) {
            return false;
        }
        return true;
    });
    
    if (availablePoints.length > 0) {
        nextSpawnPoint = availablePoints[Math.floor(Math.random() * availablePoints.length)];
    }
}

// Move enemy snake towards food
function moveEnemySnake(enemy) {
    const head = enemy.segments[0];
    const dx = food.x - head.x;
    const dy = food.y - head.y;
    
    // Simple AI: move towards food
    if (Math.abs(dx) > Math.abs(dy)) {
        enemy.direction = { x: Math.sign(dx), y: 0 };
    } else {
        enemy.direction = { x: 0, y: Math.sign(dy) };
    }
    
    const newHead = {
        x: head.x + enemy.direction.x,
        y: head.y + enemy.direction.y
    };
    
    // Check boundaries
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        return false;
    }
    
    // Check collision with player snake - deadly for enemy, player protected by shield
    if (snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        createCollisionMarker(newHead.x, newHead.y);
        enemy.segments.forEach(segment => {
            createExplosion(segment.x, segment.y);
        });
        playExplosionSound();
        
        if (!shieldActive) {
            playCollisionSound();
            gameOver();
        }
        return false;
    }
    
    // Check collision with other enemies - deadly for both
    for (let i = 0; i < enemySnakes.length; i++) {
        const other = enemySnakes[i];
        if (other !== enemy && 
            other.segments.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
            // Both snakes die
            createCollisionMarker(newHead.x, newHead.y);
            enemy.segments.forEach(segment => createExplosion(segment.x, segment.y));
            other.segments.forEach(segment => createExplosion(segment.x, segment.y));
            playExplosionSound();
            enemySnakes.splice(i, 1);
            return false;
        }
    }
    
    enemy.segments.unshift(newHead);
    
    // Check food collision
    if (newHead.x === food.x && newHead.y === food.y) {
        playFoodSound();
        generateFood();
    } else {
        enemy.segments.pop();
    }
    
    return true;
}

// Create chain reaction explosion
function createExplosion(x, y) {
    explosions.push({
        x: x,
        y: y,
        radius: 0,
        maxRadius: 30
    });
}

// Create collision marker
function createCollisionMarker(x, y) {
    collisionMarkers.push({
        x: x,
        y: y,
        lifetime: 30
    });
}

// Update game state
function update() {
    if (!gameRunning) return;

    direction = { ...nextDirection };

    // Move snake
    const head = { ...snake[0] };
    head.x += direction.x;
    head.y += direction.y;

    // Check wall collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        gameOver();
        return;
    }

    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        playCollisionSound();
        gameOver();
        return;
    }
    
    // Check collision with enemy snakes
    for (let i = enemySnakes.length - 1; i >= 0; i--) {
        const enemy = enemySnakes[i];
        if (enemy.segments.some(segment => segment.x === head.x && segment.y === head.y)) {
            createCollisionMarker(head.x, head.y);
            
            if (shieldActive) {
                // Shield active - destroy enemy
                enemy.segments.forEach(segment => {
                    createExplosion(segment.x, segment.y);
                    score += 20;
                });
                playExplosionSound();
                updateScore();
                enemySnakes.splice(i, 1);
            } else {
                // No shield - game over
                playCollisionSound();
                gameOver();
                return;
            }
        }
    }

    snake.unshift(head);

    // Check food collision
    if (head.x === food.x && head.y === food.y) {
        playFoodSound();
        score += 10;
        updateScore();
        generateFood();
    } else {
        snake.pop();
    }

    // Update projectiles
    projectiles = projectiles.filter(projectile => {
        projectile.x += projectile.dx * PROJECTILE_SPEED;
        projectile.y += projectile.dy * PROJECTILE_SPEED;

        // Remove projectiles that go off screen
        if (projectile.x < 0 || projectile.x >= GRID_SIZE || 
            projectile.y < 0 || projectile.y >= GRID_SIZE) {
            return false;
        }

        // Check if projectile hits food
        if (Math.abs(projectile.x - food.x) < 0.5 && 
            Math.abs(projectile.y - food.y) < 0.5) {
            score += 5;
            updateScore();
            generateFood();
            return false;
        }
        
        // Check if projectile hits enemy snake
        for (let i = enemySnakes.length - 1; i >= 0; i--) {
            const enemy = enemySnakes[i];
            const hitSegment = enemy.segments.find(segment => {
                const dx = Math.abs(projectile.x - segment.x);
                const dy = Math.abs(projectile.y - segment.y);
                return dx < 0.8 && dy < 0.8;
            });
            
            if (hitSegment) {
                // Create collision marker at hit location
                createCollisionMarker(hitSegment.x, hitSegment.y);
                // Chain reaction: destroy all segments
                enemy.segments.forEach(segment => {
                    createExplosion(segment.x, segment.y);
                    score += 20;
                });
                playExplosionSound();
                updateScore();
                enemySnakes.splice(i, 1);
                return false;
            }
        }

        return true;
    });
    
    // Handle enemy spawning with countdown
    const timeSinceLastSpawn = Date.now() - lastEnemySpawn;
    
    if (timeSinceLastSpawn > ENEMY_SPAWN_DELAY) {
        spawnEnemySnake();
        lastEnemySpawn = Date.now();
    } else if (timeSinceLastSpawn > ENEMY_SPAWN_DELAY - COUNTDOWN_START && !nextSpawnPoint) {
        selectNextSpawnPoint();
        if (nextSpawnPoint) {
            spawnCountdown = Math.ceil((ENEMY_SPAWN_DELAY - timeSinceLastSpawn) / 1000);
        }
    } else if (nextSpawnPoint) {
        spawnCountdown = Math.ceil((ENEMY_SPAWN_DELAY - timeSinceLastSpawn) / 1000);
    }
    
    // Update enemy snakes
    enemySnakes = enemySnakes.filter(enemy => moveEnemySnake(enemy));
    
    // Update explosions
    explosions = explosions.filter(explosion => {
        explosion.radius += 2;
        return explosion.radius < explosion.maxRadius;
    });
    
    // Update collision markers
    collisionMarkers = collisionMarkers.filter(marker => {
        marker.lifetime--;
        return marker.lifetime > 0;
    });
    
    // Update shield status
    const now = Date.now();
    if (shieldActive && now >= shieldEndTime) {
        shieldActive = false;
        shieldCooldownEnd = now + SHIELD_COOLDOWN;
    }
    
    // Update ability visuals
    updateAbilityVisuals();
}

// Render game
function render() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#16213e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(canvas.width, i * CELL_SIZE);
        ctx.stroke();
    }

    // Draw snake
    snake.forEach((segment, index) => {
        if (shieldActive) {
            // Shield mode - blue snake
            if (index === 0) {
                const gradient = ctx.createRadialGradient(
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    0,
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE / 2
                );
                gradient.addColorStop(0, '#64b5f6');
                gradient.addColorStop(1, '#1976d2');
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = '#2196f3';
            }
        } else {
            // Normal mode - yellow snake
            if (index === 0) {
                const gradient = ctx.createRadialGradient(
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    0,
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE / 2
                );
                gradient.addColorStop(0, '#ffeb3b');
                gradient.addColorStop(1, '#f9a825');
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = '#fdd835';
            }
        }
        ctx.fillRect(
            segment.x * CELL_SIZE + 2,
            segment.y * CELL_SIZE + 2,
            CELL_SIZE - 4,
            CELL_SIZE - 4
        );

        // Draw gun on head
        if (index === 0) {
            ctx.fillStyle = '#f38181';
            const gunX = segment.x * CELL_SIZE + CELL_SIZE / 2 + direction.x * CELL_SIZE / 3;
            const gunY = segment.y * CELL_SIZE + CELL_SIZE / 2 + direction.y * CELL_SIZE / 3;
            ctx.fillRect(gunX - 3, gunY - 3, 6, 6);
        }
    });

    // Draw food
    const foodGradient = ctx.createRadialGradient(
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        0,
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2
    );
    foodGradient.addColorStop(0, '#66bb6a');
    foodGradient.addColorStop(1, '#2e7d32');
    ctx.fillStyle = foodGradient;
    ctx.beginPath();
    ctx.arc(
        food.x * CELL_SIZE + CELL_SIZE / 2,
        food.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Draw enemy snakes
    enemySnakes.forEach(enemy => {
        enemy.segments.forEach((segment, index) => {
            if (index === 0) {
                // Enemy head with gradient
                const gradient = ctx.createRadialGradient(
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    0,
                    segment.x * CELL_SIZE + CELL_SIZE / 2,
                    segment.y * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE / 2
                );
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(1, '#cccccc');
                ctx.fillStyle = gradient;
            } else {
                // Enemy body
                ctx.fillStyle = '#e0e0e0';
            }
            ctx.fillRect(
                segment.x * CELL_SIZE + 2,
                segment.y * CELL_SIZE + 2,
                CELL_SIZE - 4,
                CELL_SIZE - 4
            );
        });
    });

    // Draw projectiles
    ctx.fillStyle = '#f44336';
    projectiles.forEach(projectile => {
        ctx.beginPath();
        ctx.arc(
            projectile.x * CELL_SIZE + CELL_SIZE / 2,
            projectile.y * CELL_SIZE + CELL_SIZE / 2,
            4,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });
    
    // Draw explosions
    explosions.forEach(explosion => {
        const alpha = 1 - (explosion.radius / explosion.maxRadius);
        ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
        ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.3})`;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(
            explosion.x * CELL_SIZE + CELL_SIZE / 2,
            explosion.y * CELL_SIZE + CELL_SIZE / 2,
            explosion.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw spawn countdown and indicator
    if (nextSpawnPoint && spawnCountdown > 0) {
        // Draw spawn point indicator
        ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + 0.3 * Math.sin(Date.now() * 0.01)})`;
        ctx.fillRect(
            nextSpawnPoint.x * CELL_SIZE,
            nextSpawnPoint.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
        );
        
        // Draw countdown number
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            spawnCountdown.toString(),
            nextSpawnPoint.x * CELL_SIZE + CELL_SIZE / 2,
            nextSpawnPoint.y * CELL_SIZE + CELL_SIZE / 2 + 7
        );
    }
    
    // Draw collision markers
    collisionMarkers.forEach(marker => {
        ctx.strokeStyle = '#9c27b0';
        ctx.lineWidth = 3;
        const size = 8;
        
        // Draw X
        ctx.beginPath();
        ctx.moveTo(
            marker.x * CELL_SIZE + CELL_SIZE / 2 - size,
            marker.y * CELL_SIZE + CELL_SIZE / 2 - size
        );
        ctx.lineTo(
            marker.x * CELL_SIZE + CELL_SIZE / 2 + size,
            marker.y * CELL_SIZE + CELL_SIZE / 2 + size
        );
        ctx.moveTo(
            marker.x * CELL_SIZE + CELL_SIZE / 2 + size,
            marker.y * CELL_SIZE + CELL_SIZE / 2 - size
        );
        ctx.lineTo(
            marker.x * CELL_SIZE + CELL_SIZE / 2 - size,
            marker.y * CELL_SIZE + CELL_SIZE / 2 + size
        );
        ctx.stroke();
    });
}

// Game loop
function gameStep() {
    update();
    render();
}

// Game over
function gameOver() {
    gameRunning = false;
    clearInterval(gameLoop);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        highScoreElement.textContent = highScore;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 30);
    
    ctx.font = '24px Arial';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
    
    startBtn.textContent = 'Play Again';
}

// Update score display
function updateScore() {
    scoreElement.textContent = score;
}

// Shoot projectile
function shoot() {
    if (!gameRunning) return;
    
    const head = snake[0];
    projectiles.push({
        x: head.x,
        y: head.y,
        dx: direction.x,
        dy: direction.y
    });
    gunFlashEnd = Date.now() + 200;
}

// Activate shield
function activateShield() {
    if (!gameRunning || shieldActive || Date.now() < shieldCooldownEnd) return;
    
    shieldActive = true;
    shieldEndTime = Date.now() + SHIELD_DURATION;
    playSound(600, 0.3, 'sine');
}

// Update ability visual indicators
function updateAbilityVisuals() {
    const now = Date.now();
    
    // Gun text
    if (now < gunFlashEnd) {
        gunText.style.color = '#ff0000';
    } else {
        gunText.style.color = '#ffffff';
    }
    
    // Shield text and timer
    if (spaceKeyDown && !shieldActive && now >= shieldCooldownEnd) {
        // Holding spacebar - show activation countdown
        const holdTime = now - spaceKeyHoldStart;
        const remainingTime = Math.max(0, SHIELD_ACTIVATION_TIME - holdTime);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        shieldText.style.color = '#ffffff';
    } else if (shieldActive) {
        // Shield active - show remaining time
        const remainingTime = Math.max(0, shieldEndTime - now);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        shieldText.style.color = '#2196f3';
    } else if (now < shieldCooldownEnd) {
        // Shield cooling down - show cooldown time
        const remainingTime = Math.max(0, shieldCooldownEnd - now);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        const cooldownProgress = 1 - ((shieldCooldownEnd - now) / SHIELD_COOLDOWN);
        const gray = Math.floor(128 + 127 * cooldownProgress);
        shieldText.style.color = `rgb(${gray}, ${gray}, ${gray})`;
    } else {
        // Shield ready
        shieldTimer.textContent = '';
        shieldText.style.color = '#ffffff';
    }
}

// Handle keyboard input
document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;

    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            if (direction.y === 0) {
                nextDirection = { x: 0, y: -1 };
            }
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            if (direction.y === 0) {
                nextDirection = { x: 0, y: 1 };
            }
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (direction.x === 0) {
                nextDirection = { x: -1, y: 0 };
            }
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            if (direction.x === 0) {
                nextDirection = { x: 1, y: 0 };
            }
            break;
        case ' ':
            e.preventDefault();
            if (!gameRunning) {
                // Game over - restart with spacebar
                startGame();
            } else if (!spaceKeyDown) {
                spaceKeyDown = true;
                spaceKeyHoldStart = Date.now();
                
                // Set timer for shield activation
                if (!shieldActive && Date.now() >= shieldCooldownEnd) {
                    shieldActivationTimer = setTimeout(() => {
                        if (spaceKeyDown) {
                            activateShield();
                        }
                    }, SHIELD_ACTIVATION_TIME);
                }
            }
            break;
    }
});

// Handle key release
document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
        e.preventDefault();
        if (spaceKeyDown) {
            // Clear shield activation timer
            if (shieldActivationTimer) {
                clearTimeout(shieldActivationTimer);
                shieldActivationTimer = null;
            }
            
            const holdDuration = Date.now() - spaceKeyHoldStart;
            if (holdDuration < SHIELD_ACTIVATION_TIME && !shieldActive) {
                // Released before 1 second - shoot
                shoot();
                playShootSound();
            }
            spaceKeyDown = false;
        }
    }
});

// Start game function
function startGame() {
    if (gameLoop) clearInterval(gameLoop);
    init();
    gameLoop = setInterval(gameStep, GAME_SPEED);
    startBtn.textContent = 'Restart';
}

// Start button handler
startBtn.addEventListener('click', startGame);

// Speed slider handler
speedSlider.addEventListener('input', (e) => {
    GAME_SPEED = parseInt(e.target.value);
    speedValue.textContent = GAME_SPEED + 'ms';
    
    // Update game loop if running
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = setInterval(gameStep, GAME_SPEED);
    }
});

// Initial render
render();