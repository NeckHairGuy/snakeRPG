const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const startBtn = document.getElementById('startBtn');
const gunText = document.getElementById('gunText');
const shieldText = document.getElementById('shieldText');
const shieldTimer = document.getElementById('shieldTimer');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const posXElement = document.getElementById('posX');
const posYElement = document.getElementById('posY');

// Game constants
const CELL_SIZE = 25;
let GAME_SPEED = 100;
const PROJECTILE_SPEED = 1.5;
const ENEMY_SPAWN_DELAY = 5000;
const MAX_ENEMIES = 8;
const SPAWN_DISTANCE = 30; // Spawn enemies at least this many cells away
const COUNTDOWN_START = 3000;
const SHIELD_DURATION = 1000;
const SHIELD_COOLDOWN = 5000;
const SHIELD_ACTIVATION_TIME = 500;
const MINIMAP_RANGE = 50; // Show 50 cells in each direction on minimap
const FOOD_SPAWN_RANGE = 40; // Food spawns within this range

// Set canvas to full viewport
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

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

// Game state
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let foods = []; // Multiple food items
let projectiles = [];
let enemySnakes = [];
let explosions = [];
let collisionMarkers = [];
let score = 0;
let highScore = localStorage.getItem('openWorldSnakeHighScore') || 0;
let gameRunning = false;
let gameLoop = null;
let lastEnemySpawn = 0;
let nextSpawnLocation = null;
let spawnCountdown = 0;
let shieldActive = false;
let shieldEndTime = 0;
let shieldCooldownEnd = 0;
let spaceKeyDown = false;
let spaceKeyHoldStart = 0;
let gunFlashEnd = 0;
let shieldActivationTimer = null;

// Camera state
let camera = {
    x: 0,
    y: 0
};

// Initialize game
function init() {
    snake = [
        { x: 0, y: 0 },
        { x: -1, y: 0 },
        { x: -2, y: 0 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    projectiles = [];
    enemySnakes = [];
    explosions = [];
    collisionMarkers = [];
    foods = [];
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
    
    // Generate initial food items
    for (let i = 0; i < 10; i++) {
        generateFood();
    }
    
    gameRunning = true;
}

// Generate food at random position around snake
function generateFood() {
    let attempts = 0;
    let food;
    
    do {
        const angle = Math.random() * Math.PI * 2;
        const distance = 5 + Math.random() * FOOD_SPAWN_RANGE;
        
        food = {
            x: Math.floor(snake[0].x + Math.cos(angle) * distance),
            y: Math.floor(snake[0].y + Math.sin(angle) * distance)
        };
        attempts++;
    } while ((snake.some(segment => segment.x === food.x && segment.y === food.y) ||
             enemySnakes.some(enemy => enemy.segments.some(segment => segment.x === food.x && segment.y === food.y)) ||
             foods.some(f => f.x === food.x && f.y === food.y)) && attempts < 100);
    
    if (attempts < 100) {
        foods.push(food);
    }
}

// Spawn enemy snake
function spawnEnemySnake() {
    if (enemySnakes.length >= MAX_ENEMIES || !nextSpawnLocation) return;
    
    const spawn = nextSpawnLocation;
    const dir = {
        x: Math.sign(snake[0].x - spawn.x) || 1,
        y: Math.sign(snake[0].y - spawn.y) || 0
    };
    
    if (dir.x === 0 && dir.y === 0) {
        dir.x = 1;
    }
    
    enemySnakes.push({
        segments: [
            { x: spawn.x, y: spawn.y },
            { x: spawn.x - dir.x, y: spawn.y - dir.y },
            { x: spawn.x - dir.x * 2, y: spawn.y - dir.y * 2 }
        ],
        direction: dir,
        color: '#ffffff',
        targetFood: null
    });
    
    nextSpawnLocation = null;
    spawnCountdown = 0;
}

// Get next spawn location
function selectNextSpawnLocation() {
    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_DISTANCE + Math.random() * 10;
    
    nextSpawnLocation = {
        x: Math.floor(snake[0].x + Math.cos(angle) * distance),
        y: Math.floor(snake[0].y + Math.sin(angle) * distance)
    };
}

// Find nearest food for enemy
function findNearestFood(enemyHead) {
    let nearestFood = null;
    let minDistance = Infinity;
    
    foods.forEach(food => {
        const distance = Math.abs(food.x - enemyHead.x) + Math.abs(food.y - enemyHead.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearestFood = food;
        }
    });
    
    return nearestFood;
}

// Move enemy snake
function moveEnemySnake(enemy) {
    const head = enemy.segments[0];
    
    // Find target food if none or if current target was eaten
    if (!enemy.targetFood || !foods.includes(enemy.targetFood)) {
        enemy.targetFood = findNearestFood(head);
    }
    
    if (enemy.targetFood) {
        const dx = enemy.targetFood.x - head.x;
        const dy = enemy.targetFood.y - head.y;
        
        // Simple AI: move towards food
        if (Math.abs(dx) > Math.abs(dy)) {
            enemy.direction = { x: Math.sign(dx), y: 0 };
        } else {
            enemy.direction = { x: 0, y: Math.sign(dy) };
        }
    } else {
        // No food, wander randomly
        if (Math.random() < 0.1) {
            const dirs = [
                { x: 1, y: 0 },
                { x: -1, y: 0 },
                { x: 0, y: 1 },
                { x: 0, y: -1 }
            ];
            enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
        }
    }
    
    const newHead = {
        x: head.x + enemy.direction.x,
        y: head.y + enemy.direction.y
    };
    
    // Check collision with player snake
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
    
    // Check collision with other enemies
    for (let i = 0; i < enemySnakes.length; i++) {
        const other = enemySnakes[i];
        if (other !== enemy && 
            other.segments.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
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
    const foodIndex = foods.findIndex(food => food.x === newHead.x && food.y === newHead.y);
    if (foodIndex !== -1) {
        foods.splice(foodIndex, 1);
        generateFood(); // Spawn new food
        playFoodSound();
        enemy.targetFood = null;
    } else {
        enemy.segments.pop();
    }
    
    return true;
}

// Create explosion
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
                enemy.segments.forEach(segment => {
                    createExplosion(segment.x, segment.y);
                    score += 20;
                });
                playExplosionSound();
                updateScore();
                enemySnakes.splice(i, 1);
            } else {
                playCollisionSound();
                gameOver();
                return;
            }
        }
    }

    snake.unshift(head);

    // Check food collision
    const foodIndex = foods.findIndex(food => food.x === head.x && food.y === head.y);
    if (foodIndex !== -1) {
        foods.splice(foodIndex, 1);
        generateFood();
        playFoodSound();
        score += 10;
        updateScore();
    } else {
        snake.pop();
    }

    // Update camera to follow snake
    camera.x = snake[0].x * CELL_SIZE - canvas.width / 2;
    camera.y = snake[0].y * CELL_SIZE - canvas.height / 2;

    // Update position indicator
    posXElement.textContent = snake[0].x;
    posYElement.textContent = snake[0].y;

    // Update projectiles
    projectiles = projectiles.filter(projectile => {
        projectile.x += projectile.dx * PROJECTILE_SPEED;
        projectile.y += projectile.dy * PROJECTILE_SPEED;

        // Remove projectiles that are too far away
        const distance = Math.abs(projectile.x - snake[0].x) + Math.abs(projectile.y - snake[0].y);
        if (distance > 100) {
            return false;
        }

        // Check if projectile hits food
        const hitFoodIndex = foods.findIndex(food => 
            Math.abs(projectile.x - food.x) < 0.5 && 
            Math.abs(projectile.y - food.y) < 0.5
        );
        
        if (hitFoodIndex !== -1) {
            score += 5;
            updateScore();
            foods.splice(hitFoodIndex, 1);
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
                createCollisionMarker(hitSegment.x, hitSegment.y);
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
    
    // Handle enemy spawning
    const timeSinceLastSpawn = Date.now() - lastEnemySpawn;
    
    if (timeSinceLastSpawn > ENEMY_SPAWN_DELAY) {
        spawnEnemySnake();
        lastEnemySpawn = Date.now();
    } else if (timeSinceLastSpawn > ENEMY_SPAWN_DELAY - COUNTDOWN_START && !nextSpawnLocation) {
        selectNextSpawnLocation();
        if (nextSpawnLocation) {
            spawnCountdown = Math.ceil((ENEMY_SPAWN_DELAY - timeSinceLastSpawn) / 1000);
        }
    } else if (nextSpawnLocation) {
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

// Draw grid pattern
function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    const startX = Math.floor(camera.x / CELL_SIZE) * CELL_SIZE;
    const startY = Math.floor(camera.y / CELL_SIZE) * CELL_SIZE;
    const endX = startX + canvas.width + CELL_SIZE;
    const endY = startY + canvas.height + CELL_SIZE;
    
    for (let x = startX; x <= endX; x += CELL_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x - camera.x, 0);
        ctx.lineTo(x - camera.x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = startY; y <= endY; y += CELL_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y - camera.y);
        ctx.lineTo(canvas.width, y - camera.y);
        ctx.stroke();
    }
}

// Render game
function render() {
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid();

    // Draw foods
    foods.forEach(food => {
        const x = food.x * CELL_SIZE - camera.x;
        const y = food.y * CELL_SIZE - camera.y;
        
        // Only draw if on screen
        if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
            y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
            
            const foodGradient = ctx.createRadialGradient(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                0,
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2
            );
            foodGradient.addColorStop(0, '#66bb6a');
            foodGradient.addColorStop(1, '#2e7d32');
            ctx.fillStyle = foodGradient;
            ctx.beginPath();
            ctx.arc(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2 - 2,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    });

    // Draw enemy snakes
    enemySnakes.forEach(enemy => {
        enemy.segments.forEach((segment, index) => {
            const x = segment.x * CELL_SIZE - camera.x;
            const y = segment.y * CELL_SIZE - camera.y;
            
            if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
                y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
                
                if (index === 0) {
                    const gradient = ctx.createRadialGradient(
                        x + CELL_SIZE / 2,
                        y + CELL_SIZE / 2,
                        0,
                        x + CELL_SIZE / 2,
                        y + CELL_SIZE / 2,
                        CELL_SIZE / 2
                    );
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(1, '#cccccc');
                    ctx.fillStyle = gradient;
                } else {
                    ctx.fillStyle = '#e0e0e0';
                }
                ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
            }
        });
    });

    // Draw snake
    snake.forEach((segment, index) => {
        const x = segment.x * CELL_SIZE - camera.x;
        const y = segment.y * CELL_SIZE - camera.y;
        
        if (shieldActive) {
            if (index === 0) {
                const gradient = ctx.createRadialGradient(
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE / 2,
                    0,
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE / 2,
                    CELL_SIZE / 2
                );
                gradient.addColorStop(0, '#64b5f6');
                gradient.addColorStop(1, '#1976d2');
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = '#2196f3';
            }
        } else {
            if (index === 0) {
                const gradient = ctx.createRadialGradient(
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE / 2,
                    0,
                    x + CELL_SIZE / 2,
                    y + CELL_SIZE / 2,
                    CELL_SIZE / 2
                );
                gradient.addColorStop(0, '#ffeb3b');
                gradient.addColorStop(1, '#f9a825');
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = '#fdd835';
            }
        }
        ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);

        // Draw gun on head
        if (index === 0) {
            ctx.fillStyle = '#f38181';
            const gunX = x + CELL_SIZE / 2 + direction.x * CELL_SIZE / 3;
            const gunY = y + CELL_SIZE / 2 + direction.y * CELL_SIZE / 3;
            ctx.fillRect(gunX - 3, gunY - 3, 6, 6);
        }
    });

    // Draw projectiles
    ctx.fillStyle = '#f44336';
    projectiles.forEach(projectile => {
        const x = projectile.x * CELL_SIZE - camera.x;
        const y = projectile.y * CELL_SIZE - camera.y;
        
        if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
            y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
            ctx.beginPath();
            ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    // Draw explosions
    explosions.forEach(explosion => {
        const x = explosion.x * CELL_SIZE - camera.x;
        const y = explosion.y * CELL_SIZE - camera.y;
        
        const alpha = 1 - (explosion.radius / explosion.maxRadius);
        ctx.strokeStyle = `rgba(255, 100, 0, ${alpha})`;
        ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.3})`;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, explosion.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw spawn countdown
    if (nextSpawnLocation && spawnCountdown > 0) {
        const x = nextSpawnLocation.x * CELL_SIZE - camera.x;
        const y = nextSpawnLocation.y * CELL_SIZE - camera.y;
        
        if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
            y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
            
            ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + 0.3 * Math.sin(Date.now() * 0.01)})`;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(spawnCountdown.toString(), x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 7);
        }
    }
    
    // Draw collision markers
    collisionMarkers.forEach(marker => {
        const x = marker.x * CELL_SIZE - camera.x;
        const y = marker.y * CELL_SIZE - camera.y;
        
        if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
            y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
            
            ctx.strokeStyle = '#9c27b0';
            ctx.lineWidth = 3;
            const size = 8;
            
            ctx.beginPath();
            ctx.moveTo(x + CELL_SIZE / 2 - size, y + CELL_SIZE / 2 - size);
            ctx.lineTo(x + CELL_SIZE / 2 + size, y + CELL_SIZE / 2 + size);
            ctx.moveTo(x + CELL_SIZE / 2 + size, y + CELL_SIZE / 2 - size);
            ctx.lineTo(x + CELL_SIZE / 2 - size, y + CELL_SIZE / 2 + size);
            ctx.stroke();
        }
    });
    
    // Draw minimap
    drawMinimap();
}

// Draw minimap
function drawMinimap() {
    minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    minimapCtx.fillRect(0, 0, 200, 200);
    
    const scale = 200 / (MINIMAP_RANGE * 2);
    const centerX = 100;
    const centerY = 100;
    
    // Draw foods on minimap
    minimapCtx.fillStyle = '#4caf50';
    foods.forEach(food => {
        const dx = food.x - snake[0].x;
        const dy = food.y - snake[0].y;
        
        if (Math.abs(dx) < MINIMAP_RANGE && Math.abs(dy) < MINIMAP_RANGE) {
            const x = centerX + dx * scale;
            const y = centerY + dy * scale;
            minimapCtx.fillRect(x - 1, y - 1, 2, 2);
        }
    });
    
    // Draw enemies on minimap
    minimapCtx.fillStyle = '#ff5722';
    enemySnakes.forEach(enemy => {
        const dx = enemy.segments[0].x - snake[0].x;
        const dy = enemy.segments[0].y - snake[0].y;
        
        if (Math.abs(dx) < MINIMAP_RANGE && Math.abs(dy) < MINIMAP_RANGE) {
            const x = centerX + dx * scale;
            const y = centerY + dy * scale;
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        }
    });
    
    // Draw player in center
    minimapCtx.fillStyle = '#ffeb3b';
    minimapCtx.fillRect(centerX - 2, centerY - 2, 4, 4);
    
    // Draw direction indicator
    minimapCtx.strokeStyle = '#ffeb3b';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(centerX, centerY);
    minimapCtx.lineTo(centerX + direction.x * 10, centerY + direction.y * 10);
    minimapCtx.stroke();
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
        localStorage.setItem('openWorldSnakeHighScore', highScore);
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
        gunText.style.color = '#ff6b6b';
    }
    
    // Shield text and timer
    if (spaceKeyDown && !shieldActive && now >= shieldCooldownEnd) {
        const holdTime = now - spaceKeyHoldStart;
        const remainingTime = Math.max(0, SHIELD_ACTIVATION_TIME - holdTime);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        shieldText.style.color = '#ffffff';
    } else if (shieldActive) {
        const remainingTime = Math.max(0, shieldEndTime - now);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        shieldText.style.color = '#2196f3';
    } else if (now < shieldCooldownEnd) {
        const remainingTime = Math.max(0, shieldCooldownEnd - now);
        shieldTimer.textContent = (remainingTime / 1000).toFixed(1);
        const cooldownProgress = 1 - ((shieldCooldownEnd - now) / SHIELD_COOLDOWN);
        const gray = Math.floor(128 + 127 * cooldownProgress);
        shieldText.style.color = `rgb(${gray}, ${gray}, ${gray})`;
    } else {
        shieldTimer.textContent = '';
        shieldText.style.color = '#4dabf7';
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
                startGame();
            } else if (!spaceKeyDown) {
                spaceKeyDown = true;
                spaceKeyHoldStart = Date.now();
                
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
            if (shieldActivationTimer) {
                clearTimeout(shieldActivationTimer);
                shieldActivationTimer = null;
            }
            
            const holdDuration = Date.now() - spaceKeyHoldStart;
            if (holdDuration < SHIELD_ACTIVATION_TIME && !shieldActive) {
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
    
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = setInterval(gameStep, GAME_SPEED);
    }
});

// Initial render
render();