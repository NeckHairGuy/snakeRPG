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

// Segment types with effects and triggers
const SEGMENT_TYPES = {
    HEAD: 'H',
    GUN: 'G',
    SHIELD: 'S',
    BODY: 'B'
};

// Trigger conditions
const TRIGGERS = {
    NONE: 'none',
    SHORT_PRESS: 'short_press',
    LONG_PRESS: 'long_press'
};

// Segment definitions with effects
const SEGMENT_DEFINITIONS = {
    [SEGMENT_TYPES.HEAD]: {
        name: 'Head',
        trigger: TRIGGERS.NONE,
        effect: null,
        description: 'Always first, cannot be moved or removed'
    },
    [SEGMENT_TYPES.GUN]: {
        name: 'Gun',
        trigger: TRIGGERS.SHORT_PRESS,
        effect: 'launch_projectile',
        description: 'Launch a projectile forward from the head'
    },
    [SEGMENT_TYPES.SHIELD]: {
        name: 'Shield',
        trigger: TRIGGERS.LONG_PRESS,
        effect: 'invincibility',
        description: 'Render the entire snake invincible for 1 second'
    },
    [SEGMENT_TYPES.BODY]: {
        name: 'Body',
        trigger: TRIGGERS.NONE,
        effect: 'fat_appearance',
        description: 'Makes you look fat'
    }
};

// Effect implementations
const SEGMENT_EFFECTS = {
    launch_projectile: () => {
        if (!gameRunning) return;
        const head = snake[0];
        projectiles.push({
            x: head.x,
            y: head.y,
            dx: direction.x,
            dy: direction.y
        });
        gunFlashEnd = Date.now() + 200;
        playShootSound();
    },
    
    invincibility: () => {
        if (!gameRunning || shieldActive || Date.now() < shieldCooldownEnd) return;
        shieldActive = true;
        shieldEndTime = Date.now() + SHIELD_DURATION;
        playSound(600, 0.3, 'sine');
    },
    
    fat_appearance: () => {
        // This effect is passive - handled in rendering
        return 'passive';
    }
};

// Display segment information in hover area
function displaySegmentInfo(segmentType) {
    const infoDisplay = document.getElementById('segmentInfoDisplay');
    const definition = SEGMENT_DEFINITIONS[segmentType];
    
    if (!definition) {
        clearSegmentInfo();
        return;
    }
    
    infoDisplay.classList.remove('empty');
    
    let triggerText = 'None';
    switch(definition.trigger) {
        case TRIGGERS.SHORT_PRESS:
            triggerText = 'Spacebar short press';
            break;
        case TRIGGERS.LONG_PRESS:
            triggerText = 'Spacebar long press (0.5s)';
            break;
        case TRIGGERS.NONE:
            triggerText = 'No trigger (passive)';
            break;
    }
    
    let effectText = 'None';
    if (definition.effect) {
        switch(definition.effect) {
            case 'launch_projectile':
                effectText = 'Launch projectile forward from head';
                break;
            case 'invincibility':
                effectText = 'Make snake invincible for 1 second';
                break;
            case 'fat_appearance':
                effectText = 'Visual effect: larger segment size';
                break;
            default:
                effectText = definition.effect;
        }
    }
    
    infoDisplay.innerHTML = `
        <div class="segment-info-content">
            <div class="segment-info-title">${definition.name} (${segmentType})</div>
            <div class="segment-info-trigger">Trigger: ${triggerText}</div>
            <div class="segment-info-effect">Effect: ${effectText}</div>
            <div class="segment-info-description">${definition.description}</div>
        </div>
    `;
}

// Clear segment information display
function clearSegmentInfo() {
    const infoDisplay = document.getElementById('segmentInfoDisplay');
    infoDisplay.classList.add('empty');
    infoDisplay.innerHTML = '<div class="segment-info-placeholder">Hover over a segment to see detailed information</div>';
}

// Game state
let snake = [];
let snakeSegments = []; // Array to store segment types
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
let gamePaused = false;
let inventoryOpen = false;
let selectedSegmentType = SEGMENT_TYPES.BODY;
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

// Drag and drop state
let draggedElement = null;
let draggedIndex = null;
let draggedFromDiscard = false;
let discardedSegments = [];
let collectableSegments = []; // Segments floating in game world

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
    // Initialize segment types: Head, Gun, Shield as starting configuration
    snakeSegments = [
        SEGMENT_TYPES.HEAD,
        SEGMENT_TYPES.GUN,
        SEGMENT_TYPES.SHIELD
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    projectiles = [];
    enemySnakes = [];
    explosions = [];
    collisionMarkers = [];
    collectableSegments = [];
    discardedSegments = [];
    foods = [];
    score = 0;
    lastEnemySpawn = Date.now();
    shieldActive = false;
    shieldEndTime = 0;
    shieldCooldownEnd = 0;
    spaceKeyDown = false;
    spaceKeyHoldStart = 0;
    gunFlashEnd = 0;
    gamePaused = false;
    inventoryOpen = false;
    if (shieldActivationTimer) {
        clearTimeout(shieldActivationTimer);
        shieldActivationTimer = null;
    }
    updateScore();
    highScoreElement.textContent = highScore;
    updateAbilityAvailability();
    
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

// Find nearest food or collectable segment for enemy
function findNearestFood(enemyHead) {
    let nearestItem = null;
    let minDistance = Infinity;
    
    // Check regular food
    foods.forEach(food => {
        const distance = Math.abs(food.x - enemyHead.x) + Math.abs(food.y - enemyHead.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearestItem = { x: food.x, y: food.y, type: 'food' };
        }
    });
    
    // Check collectable segments
    collectableSegments.forEach(segment => {
        const distance = Math.abs(Math.floor(segment.x) - enemyHead.x) + Math.abs(Math.floor(segment.y) - enemyHead.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearestItem = { x: Math.floor(segment.x), y: Math.floor(segment.y), type: 'segment' };
        }
    });
    
    return nearestItem;
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
        generateFood();
        playFoodSound();
        enemy.targetFood = null;
    } else {
        // Check collectable segment collision
        const segmentIndex = collectableSegments.findIndex(seg => 
            Math.floor(seg.x) === newHead.x && Math.floor(seg.y) === newHead.y
        );
        
        if (segmentIndex !== -1) {
            collectableSegments.splice(segmentIndex, 1);
            playFoodSound();
            enemy.targetFood = null;
        } else {
            enemy.segments.pop();
        }
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

// Check if snake has specific segment type
function hasSegmentType(type) {
    return snakeSegments.includes(type);
}

// Get all segments that respond to a specific trigger
function getSegmentsByTrigger(trigger) {
    return snakeSegments.filter(segmentType => 
        SEGMENT_DEFINITIONS[segmentType].trigger === trigger
    );
}

// Execute effects for segments with specific trigger
function triggerSegmentEffects(trigger) {
    const triggeredSegments = getSegmentsByTrigger(trigger);
    triggeredSegments.forEach(segmentType => {
        const definition = SEGMENT_DEFINITIONS[segmentType];
        if (definition.effect && SEGMENT_EFFECTS[definition.effect]) {
            SEGMENT_EFFECTS[definition.effect]();
        }
    });
}

// Count segments with fat effect for rendering
function getFatSegmentCount() {
    return snakeSegments.filter(segmentType => 
        SEGMENT_DEFINITIONS[segmentType].effect === 'fat_appearance'
    ).length;
}

// Update ability availability based on segments
function updateAbilityAvailability() {
    // Check for gun segments (short press trigger)
    const hasGun = getSegmentsByTrigger(TRIGGERS.SHORT_PRESS).length > 0;
    if (hasGun) {
        gunText.style.display = 'inline';
    } else {
        gunText.style.display = 'none';
    }
    
    // Check for shield segments (long press trigger)
    const hasShield = getSegmentsByTrigger(TRIGGERS.LONG_PRESS).length > 0;
    if (hasShield) {
        document.querySelector('.shield-container').style.display = 'inline-block';
    } else {
        document.querySelector('.shield-container').style.display = 'none';
    }
}

// Update game state
function update() {
    if (!gameRunning || gamePaused || inventoryOpen) return;

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
        // Add a body segment when eating food
        snakeSegments.push(SEGMENT_TYPES.BODY);
    } else {
        // Check collectable segment collision
        const segmentIndex = collectableSegments.findIndex(seg => 
            Math.floor(seg.x) === head.x && Math.floor(seg.y) === head.y
        );
        
        if (segmentIndex !== -1) {
            const collectedSegment = collectableSegments[segmentIndex];
            collectableSegments.splice(segmentIndex, 1);
            playFoodSound();
            score += 5;
            updateScore();
            // Add the specific segment type that was collected
            snakeSegments.push(collectedSegment.type);
            updateAbilityAvailability();
        } else {
            snake.pop();
            // Don't pop segments when snake isn't growing
        }
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
    
    // Update collectable segments (no movement needed, they're stationary)
    // collectableSegments persist until picked up
    
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
        const segmentType = snakeSegments[index] || SEGMENT_TYPES.BODY;
        
        // Set color based on segment type
        if (shieldActive && segmentType === SEGMENT_TYPES.SHIELD) {
            // Active shield segment
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
        } else if (segmentType === SEGMENT_TYPES.HEAD) {
            // Head segment
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
        } else if (segmentType === SEGMENT_TYPES.GUN) {
            // Gun segment
            const gradient = ctx.createRadialGradient(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                0,
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2
            );
            gradient.addColorStop(0, '#ff6b6b');
            gradient.addColorStop(1, '#ff5252');
            ctx.fillStyle = gradient;
        } else if (segmentType === SEGMENT_TYPES.SHIELD) {
            // Shield segment (inactive)
            const gradient = ctx.createRadialGradient(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                0,
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2
            );
            gradient.addColorStop(0, '#4dabf7');
            gradient.addColorStop(1, '#2196f3');
            ctx.fillStyle = gradient;
        } else {
            // Body segment
            ctx.fillStyle = '#66bb6a';
        }
        
        // Calculate size based on segment effect
        let segmentSize = CELL_SIZE - 4;
        let offset = 2;
        
        // Make body segments look "fat"
        if (segmentType === SEGMENT_TYPES.BODY) {
            segmentSize = CELL_SIZE - 1; // Bigger size
            offset = 0.5; // Smaller offset
        }
        
        ctx.fillRect(x + offset, y + offset, segmentSize, segmentSize);
        
        // Draw segment type character
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(segmentType, x + CELL_SIZE / 2, y + CELL_SIZE / 2);

        // Draw gun on head if snake has gun segments
        if (segmentType === SEGMENT_TYPES.HEAD && getSegmentsByTrigger(TRIGGERS.SHORT_PRESS).length > 0) {
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
    
    // Draw collectable segments as circles
    collectableSegments.forEach(segment => {
        const x = segment.x * CELL_SIZE - camera.x;
        const y = segment.y * CELL_SIZE - camera.y;
        
        // Only draw if on screen
        if (x > -CELL_SIZE && x < canvas.width + CELL_SIZE && 
            y > -CELL_SIZE && y < canvas.height + CELL_SIZE) {
            
            // Create gradient for segment type
            const gradient = ctx.createRadialGradient(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                0,
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2
            );
            
            switch(segment.type) {
                case SEGMENT_TYPES.GUN:
                    gradient.addColorStop(0, '#ff6b6b');
                    gradient.addColorStop(1, '#d32f2f');
                    break;
                case SEGMENT_TYPES.SHIELD:
                    gradient.addColorStop(0, '#4dabf7');
                    gradient.addColorStop(1, '#1565c0');
                    break;
                case SEGMENT_TYPES.BODY:
                    gradient.addColorStop(0, '#66bb6a');
                    gradient.addColorStop(1, '#2e7d32');
                    break;
                default:
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(1, '#cccccc');
            }
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(
                x + CELL_SIZE / 2,
                y + CELL_SIZE / 2,
                CELL_SIZE / 2 - 3,
                0,
                Math.PI * 2
            );
            ctx.fill();
            
            // Draw segment type character
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(segment.type, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
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

// Legacy functions - now handled by segment effect system
// (kept for compatibility, but redirect to new system)
function shoot() {
    triggerSegmentEffects(TRIGGERS.SHORT_PRESS);
}

function activateShield() {
    triggerSegmentEffects(TRIGGERS.LONG_PRESS);
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

// Inventory functions
function openInventory() {
    if (!gameRunning) return;
    
    // Ensure we have segments initialized
    if (!snakeSegments || snakeSegments.length === 0) {
        snakeSegments = [
            SEGMENT_TYPES.HEAD,
            SEGMENT_TYPES.GUN,
            SEGMENT_TYPES.SHIELD
        ];
    }
    
    inventoryOpen = true;
    gamePaused = true;
    discardedSegments = []; // Clear discarded segments when opening
    document.getElementById('inventoryOverlay').classList.add('active');
    updateInventoryDisplay();
}

function closeInventory() {
    // Eject discarded segments behind the snake as collectible items
    if (discardedSegments.length > 0 && snake.length > 0) {
        const tail = snake[snake.length - 1];
        const beforeTail = snake.length > 1 ? snake[snake.length - 2] : snake[0];
        const ejectDir = {
            x: tail.x - beforeTail.x || -direction.x,
            y: tail.y - beforeTail.y || -direction.y
        };
        
        discardedSegments.forEach((segment, index) => {
            const ejectPos = {
                x: tail.x + ejectDir.x * (index + 2),
                y: tail.y + ejectDir.y * (index + 2)
            };
            
            collectableSegments.push({
                x: ejectPos.x,
                y: ejectPos.y,
                type: segment
            });
        });
        
        discardedSegments = [];
    }
    
    inventoryOpen = false;
    gamePaused = false;
    document.getElementById('inventoryOverlay').classList.remove('active');
}

function updateInventoryDisplay() {
    const container = document.getElementById('snakeSegments');
    container.innerHTML = '';
    
    // Display segments with head on left
    if (!snakeSegments || snakeSegments.length === 0) {
        console.warn('No snake segments found!');
        return;
    }
    
    // Create slots in reverse order (head on left)
    const totalSlots = snakeSegments.length + 1; // Only one extra empty slot
    
    for (let i = 0; i < totalSlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'segment-slot';
        const actualIndex = i; // Keep original index for data
        slot.dataset.index = actualIndex;
        
        if (actualIndex < snakeSegments.length) {
            const segment = snakeSegments[actualIndex];
            // Creating segment slot
            
            switch(segment) {
                case SEGMENT_TYPES.HEAD:
                    slot.classList.add('head', 'locked');
                    break;
                case SEGMENT_TYPES.GUN:
                    slot.classList.add('gun');
                    break;
                case SEGMENT_TYPES.SHIELD:
                    slot.classList.add('shield');
                    break;
                case SEGMENT_TYPES.BODY:
                    slot.classList.add('body');
                    break;
            }
            
            slot.textContent = segment;
            
            // Make draggable (except head)
            if (actualIndex > 0) {
                slot.draggable = true;
                slot.addEventListener('dragstart', handleDragStart);
                slot.addEventListener('dragend', handleDragEnd);
            }
            
            // Add hover events for info display
            slot.addEventListener('mouseenter', () => displaySegmentInfo(segment));
            slot.addEventListener('mouseleave', clearSegmentInfo);
        } else {
            // Empty slot
            // Creating empty slot
            slot.classList.add('empty');
            slot.textContent = '+';
            
            // Add hover event for empty slot
            slot.addEventListener('mouseenter', () => {
                const infoDisplay = document.getElementById('segmentInfoDisplay');
                infoDisplay.classList.remove('empty');
                infoDisplay.innerHTML = `
                    <div class="segment-info-content">
                        <div class="segment-info-title">Empty Slot</div>
                        <div class="segment-info-description">Drop a segment here or use the "Add Segment" button to add a new segment of the selected type.</div>
                    </div>
                `;
            });
            slot.addEventListener('mouseleave', clearSegmentInfo);
        }
        
        // Drop zone events for all slots
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('drop', handleDrop);
        slot.addEventListener('dragenter', handleDragEnter);
        slot.addEventListener('dragleave', handleDragLeave);
        
        // Insert at the beginning to reverse the order (head on left)
        if (actualIndex < snakeSegments.length) {
            container.insertBefore(slot, container.firstChild);
        } else {
            // Empty slot goes at the end (right side)
            container.appendChild(slot);
        }
    }
    
    // Update discard area
    const discardContent = document.getElementById('discardContent');
    discardContent.innerHTML = '';
    
    if (discardedSegments.length === 0) {
        discardContent.innerHTML = '<p style="color: #666; text-align: center;">Drag segments here to remove them</p>';
    } else {
        discardedSegments.forEach((segment, index) => {
            const slot = document.createElement('div');
            slot.className = 'segment-slot';
            slot.dataset.discardIndex = index;
            
            switch(segment) {
                case SEGMENT_TYPES.GUN:
                    slot.classList.add('gun');
                    break;
                case SEGMENT_TYPES.SHIELD:
                    slot.classList.add('shield');
                    break;
                case SEGMENT_TYPES.BODY:
                    slot.classList.add('body');
                    break;
            }
            
            slot.textContent = segment;
            slot.draggable = true;
            slot.addEventListener('dragstart', handleDiscardDragStart);
            slot.addEventListener('dragend', handleDragEnd);
            
            // Add hover events for discarded segments
            slot.addEventListener('mouseenter', () => displaySegmentInfo(segment));
            slot.addEventListener('mouseleave', clearSegmentInfo);
            
            discardContent.appendChild(slot);
        });
    }
    
    // Setup discard area drop zone
    const discardArea = document.getElementById('discardArea');
    discardArea.addEventListener('dragover', handleDiscardDragOver);
    discardArea.addEventListener('drop', handleDiscardDrop);
    discardArea.addEventListener('dragenter', handleDiscardDragEnter);
    discardArea.addEventListener('dragleave', handleDiscardDragLeave);
}

// Drag and drop handlers
function handleDragStart(e) {
    draggedElement = e.target;
    draggedIndex = parseInt(e.target.dataset.index);
    draggedFromDiscard = false;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDiscardDragStart(e) {
    draggedElement = e.target;
    draggedIndex = parseInt(e.target.dataset.discardIndex);
    draggedFromDiscard = true;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElement = null;
    draggedIndex = null;
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (e.target.classList.contains('segment-slot') && !e.target.classList.contains('locked')) {
        e.target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    if (e.target.classList.contains('segment-slot')) {
        e.target.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    e.target.classList.remove('drag-over');
    
    if (draggedElement && e.target !== draggedElement && e.target.classList.contains('segment-slot')) {
        const targetIndex = parseInt(e.target.dataset.index);
        
        if (targetIndex === 0) return; // Can't drop on head slot
        
        if (draggedFromDiscard) {
            // Moving from discard back to snake
            const segmentType = discardedSegments[draggedIndex];
            if (targetIndex <= snakeSegments.length) {
                snakeSegments.splice(targetIndex, 0, segmentType);
                // Add corresponding snake position
                const insertPos = snake[Math.min(targetIndex, snake.length - 1)];
                snake.splice(targetIndex, 0, { x: insertPos.x, y: insertPos.y });
                // Remove from discarded segments
                discardedSegments.splice(draggedIndex, 1);
            }
        } else {
            // Moving within snake configuration
            if (targetIndex < snakeSegments.length || targetIndex === snakeSegments.length) {
                // Move segment to new position
                const movedSegment = snakeSegments.splice(draggedIndex, 1)[0];
                const movedSnake = snake.splice(draggedIndex, 1)[0];
                
                const insertIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
                snakeSegments.splice(insertIndex, 0, movedSegment);
                snake.splice(insertIndex, 0, movedSnake);
            }
        }
        
        updateInventoryDisplay();
        updateAbilityAvailability();
    }
    
    return false;
}

// Discard area handlers
function handleDiscardDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDiscardDragEnter(e) {
    document.getElementById('discardArea').classList.add('drag-over');
}

function handleDiscardDragLeave(e) {
    if (e.target.id === 'discardArea') {
        e.target.classList.remove('drag-over');
    }
}

function handleDiscardDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    document.getElementById('discardArea').classList.remove('drag-over');
    
    if (draggedElement && draggedIndex !== null) {
        if (draggedFromDiscard) {
            // Already in discard, do nothing
        } else if (draggedIndex > 0) {
            // Moving from snake to discard
            const segment = snakeSegments[draggedIndex];
            discardedSegments.push(segment);
            snakeSegments.splice(draggedIndex, 1);
            snake.splice(draggedIndex, 1);
            
            updateInventoryDisplay();
            updateAbilityAvailability();
        }
    }
    
    return false;
}

function addSegment() {
    // Find first empty slot or add at end
    if (snakeSegments.length < 10) {
        snakeSegments.push(selectedSegmentType);
        const tail = snake[snake.length - 1];
        snake.push({ x: tail.x, y: tail.y });
        updateInventoryDisplay();
        updateAbilityAvailability();
    }
}

function selectSegmentType(type) {
    selectedSegmentType = type;
    document.querySelectorAll('.segment-type-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.getAttribute('data-type') === type) {
            btn.classList.add('selected');
        }
    });
}

// Make functions available globally for HTML onclick
window.closeInventory = closeInventory;
window.addSegment = addSegment;
window.selectSegmentType = selectSegmentType;

// Handle keyboard input
document.addEventListener('keydown', (e) => {
    // Handle inventory toggle - check this first before game state
    if ((e.key === 'i' || e.key === 'I') && gameRunning) {
        e.preventDefault();
        if (inventoryOpen) {
            closeInventory();
        } else {
            openInventory();
        }
        return;
    }
    
    // Handle ESC to close inventory
    if (e.key === 'Escape' && inventoryOpen) {
        closeInventory();
        return;
    }
    
    if (!gameRunning || gamePaused || inventoryOpen) return;

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
                            // Trigger long press effects
                            triggerSegmentEffects(TRIGGERS.LONG_PRESS);
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
                // Trigger short press effects
                triggerSegmentEffects(TRIGGERS.SHORT_PRESS);
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