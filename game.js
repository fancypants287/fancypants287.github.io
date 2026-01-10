// High Way - Driving Simulator Game
// Main game logic

// Game constants
const LANE_WIDTH = 4;
const NUM_LANES = 2;
const HIGHWAY_WIDTH = LANE_WIDTH * NUM_LANES;
const MIN_SPEED = 100;
const MAX_SPEED = 140;
const SPEED_INCREMENT = 0.1;
const CRASH_DISTANCE = 5;
const TAILGATE_DISTANCE = 15;
const LEFT_LANE_SLOW_THRESHOLD = 100;

// Lane positions (left, right)
const LANE_POSITIONS = [-LANE_WIDTH / 2, LANE_WIDTH / 2];

// Game state
let game = {
    scene: null,
    camera: null,
    renderer: null,
    player: {
        speed: 100,
        lane: 1, // 0=left, 1=right
        targetLane: 1,
        position: 0,
        leftSignal: false,
        rightSignal: false,
        signalUsedForLaneChange: false
    },
    traffic: [],
    score: 0,       // 1_000
    scoreTimer: 0,
    gameOver: false,
    keys: {},
    roadSegments: [],
    laneMarkings: [],
    roadEdges: [],
    groundSegments: [],
    mirrorCameras: [],
    mirrorScenes: [],
    pointsAnimation: {
        increasing: false,
        decreasing: false,
        increaseInterval: null,
        decreaseInterval: null
    },
    lastFeedbackReason: null, // Track the current feedback reason
    feedbackDebounce: 0, // Prevent feedback spam
    leftLaneBlockingTime: 0 // Track how long player has been blocking left lane
};

// Initialize the game
function init() {
    // Set up scene
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x87CEEB);
    game.scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

    // Set up camera (first-person view from inside car)
    game.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
    game.camera.position.set(LANE_POSITIONS[1], 2.5, -2);
    game.camera.rotation.x = -0.1;

    // Set up renderer
    const canvas = document.getElementById('gameCanvas');
    game.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    game.renderer.setSize(window.innerWidth, window.innerHeight);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    game.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 50, 10);
    game.scene.add(directionalLight);

    // Create highway
    createHighway();

    // Create player car interior (simple dashboard view)
    createDashboard();

    // Spawn initial traffic
    spawnTraffic();

    // Set up mirror cameras
    setupMirrors();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Set up controls
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', restart);

    // Start game loop
    animate();
}

// Create highway road
function createHighway() {
    // Road surface
    const roadLength = 500;
    const roadGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH, roadLength);
    const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x333333, side: THREE.DoubleSide });
    
    for (let i = -2; i <= 2; i++) {
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.z = i * roadLength;
        game.scene.add(road);
        game.roadSegments.push(road);
    }

    // Lane markings
    const markingGeometry = new THREE.PlaneGeometry(0.3, 5);
    const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
    
    for (let lane = 0; lane < NUM_LANES - 1; lane++) {
        const laneX = -LANE_WIDTH + (lane + 1) * LANE_WIDTH;
        
        for (let z = -1500; z < 1500; z += 15) {
            const marking = new THREE.Mesh(markingGeometry, markingMaterial);
            marking.rotation.x = -Math.PI / 2;
            marking.position.set(laneX, 0.01, z);
            game.scene.add(marking);
            game.laneMarkings.push(marking);
        }
    }

    // Road edges
    const edgeGeometry = new THREE.PlaneGeometry(0.5, 5);
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00, side: THREE.DoubleSide });
    
    for (let side of [-1, 1]) {
        const edgeX = side * (HIGHWAY_WIDTH / 2 + 0.25);
        for (let z = -1500; z < 1500; z += 10) {
            const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(edgeX, 0.01, z);
            game.scene.add(edge);
            game.roadEdges.push(edge);
        }
    }

    // Ground beside road with grass texture
    const groundGeometry = new THREE.PlaneGeometry(200, 1000);
    
    // Create grass texture using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base grass color
    ctx.fillStyle = '#2a8b2a';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add random grass blades/variation
    for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const shade = Math.random();
        
        if (shade < 0.3) {
            ctx.fillStyle = '#1a6b1a'; // Darker green
        } else if (shade < 0.6) {
            ctx.fillStyle = '#2a8b2a'; // Medium green
        } else {
            ctx.fillStyle = '#3aa03a'; // Lighter green
        }
        
        ctx.fillRect(x, y, 2, 2);
    }
    
    const grassTexture = new THREE.CanvasTexture(canvas);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(20, 100);
    
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        map: grassTexture, 
        side: THREE.DoubleSide 
    });
    
    for (let side of [-1, 1]) {
        for (let i = -2; i <= 2; i++) {
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(side * (HIGHWAY_WIDTH / 2 + 100), -0.1, i * 1000);
            game.scene.add(ground);
            game.groundSegments.push(ground);
        }
    }
}

// Create simple dashboard interior
function createDashboard() {
    // Dashboard/hood (bottom of view)
    const dashGeometry = new THREE.BoxGeometry(6, 0.8, 2);
    const dashMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const dashboard = new THREE.Mesh(dashGeometry, dashMaterial);
    dashboard.position.set(0, -1.2, -1.2);
    game.camera.add(dashboard);
    
    // Steering wheel
    const wheelRadius = 0.4;
    const wheelTube = 0.05;
    const steeringWheelGeometry = new THREE.TorusGeometry(wheelRadius, wheelTube, 16, 32);
    const steeringWheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const steeringWheel = new THREE.Mesh(steeringWheelGeometry, steeringWheelMaterial);
    steeringWheel.position.set(0, -0.8, -1.0);
    steeringWheel.rotation.x = Math.PI / 6; // Tilt slightly
    game.camera.add(steeringWheel);
    
    // Steering wheel center/hub
    const hubGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
    const hubMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.position.copy(steeringWheel.position);
    hub.rotation.x = Math.PI / 2;
    game.camera.add(hub);
    
    // Speedometer gauge (simple circular display)
    const gaugeGeometry = new THREE.CircleGeometry(0.15, 32);
    const gaugeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    const gauge = new THREE.Mesh(gaugeGeometry, gaugeMaterial);
    gauge.position.set(0.6, -0.5, -1.1);
    gauge.rotation.y = -Math.PI / 8;
    game.camera.add(gauge);
    
    // Gauge rim
    const gaugeRimGeometry = new THREE.RingGeometry(0.15, 0.18, 32);
    const gaugeRimMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const gaugeRim = new THREE.Mesh(gaugeRimGeometry, gaugeRimMaterial);
    gaugeRim.position.copy(gauge.position);
    gaugeRim.rotation.copy(gauge.rotation);
    game.camera.add(gaugeRim);
    
    // Windshield frame - left A-pillar (angled)
    const pillarGeometry = new THREE.BoxGeometry(0.15, 2.5, 0.15);
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    leftPillar.position.set(-1.8, 0.3, -1.2);
    leftPillar.rotation.z = 0.3; // Angle outward
    game.camera.add(leftPillar);
    
    // Windshield frame - right A-pillar (angled)
    const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    rightPillar.position.set(1.8, 0.3, -1.2);
    rightPillar.rotation.z = -0.3; // Angle outward
    game.camera.add(rightPillar);
    
    // Roof (interior ceiling)
    const roofGeometry = new THREE.BoxGeometry(5, 0.3, 3);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, 1.3, -0.3);
    game.camera.add(roof);
    
    game.scene.add(game.camera);
}

// Create traffic car
function createTrafficCar(lane, position, speed, driverType = 'medium') {
    const carGroup = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(2, 1.5, 4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: Math.random() * 0xffffff 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    carGroup.add(body);

    // Car roof
    const roofGeometry = new THREE.BoxGeometry(1.8, 0.8, 2.5);
    const roofMaterial = new THREE.MeshLambertMaterial({ 
        color: bodyMaterial.color 
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 2;
    roof.position.z = -0.3;
    carGroup.add(roof);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
    
    const wheelPositions = [
        [-1.2, 0.4, 1.5],
        [1.2, 0.4, 1.5],
        [-1.2, 0.4, -1.5],
        [1.2, 0.4, -1.5]
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        carGroup.add(wheel);
    });

    carGroup.position.set(LANE_POSITIONS[lane], 0, position);
    game.scene.add(carGroup);

    return {
        mesh: carGroup,
        lane: lane,
        position: position,
        speed: speed,
        targetLane: lane,
        driverType: driverType,
        blockedByPlayerTime: 0, // Track how long this car has been blocked by player
        crashed: false,
        crashTime: 0,
        crashDirection: 0,
        originalY: 0
    };
}

// Check if a spawn position is safe (not too close to other cars)
function isSpawnPositionSafe(lane, position, minDistance = 30) {
    for (let car of game.traffic) {
        if (car.crashed) continue;
        if (car.lane === lane) {
            const distance = Math.abs(car.position - position);
            if (distance < minDistance) {
                return false;
            }
        }
    }
    return true;
}

// Spawn traffic
function spawnTraffic() {
    const numCars = 8;
    
    for (let i = 0; i < numCars; i++) {
        let position, lane, driverType, speed;
        let attempts = 0;
        let validPosition = false;
        
        // Try up to 10 times to find a safe position
        while (!validPosition && attempts < 10) {
            // Spawn cars both ahead and behind player
            position = -200 + Math.random() * 400; // Range: -200 to +200
            
            // Randomly select driver type
            const rand = Math.random();
            
            if (rand < 0.33) {
                // Slow driver - right lane, 100-115 km/h
                driverType = 'slow';
                lane = 1; // Right lane
                speed = 100 + Math.random() * 15;
            } else if (rand < 0.66) {
                // Fast driver - left lane, 120-150 km/h
                driverType = 'fast';
                lane = 0; // Left lane
                speed = 120 + Math.random() * 30;
            } else {
                // Medium driver - any lane, 110-125 km/h
                driverType = 'medium';
                lane = Math.floor(Math.random() * NUM_LANES);
                speed = 110 + Math.random() * 15;
            }
            
            // Check if position is safe
            if (isSpawnPositionSafe(lane, position)) {
                validPosition = true;
            }
            attempts++;
        }
        
        // Only spawn if we found a valid position
        if (validPosition) {
            game.traffic.push(createTrafficCar(lane, position, speed, driverType));
        }
    }
}

// Setup rear-view mirrors
function setupMirrors() {
    const mirrorIds = ['left-mirror', 'center-mirror', 'right-mirror'];
    
    mirrorIds.forEach((id, index) => {
        const mirrorElement = document.getElementById(id);
        const rect = mirrorElement.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        // Create separate renderer for this mirror
        const mirrorRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        mirrorRenderer.setSize(width, height);
        mirrorRenderer.domElement.style.width = '100%';
        mirrorRenderer.domElement.style.height = '100%';
        mirrorRenderer.setClearColor(0x87CEEB); // Same as scene background
        mirrorElement.appendChild(mirrorRenderer.domElement);
        
        // Create camera for this mirror
        const mirrorCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
        
        // Apply mirror effect using CSS transform instead of camera scale
        mirrorRenderer.domElement.style.transform = 'scaleX(-1)';
        
        game.mirrorCameras.push({ camera: mirrorCamera, renderer: mirrorRenderer, element: mirrorElement });
    });
}

// Resize mirrors to match their container elements
function resizeMirrors() {
    game.mirrorCameras.forEach((mirror) => {
        const rect = mirror.element.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        mirror.renderer.setSize(width, height);
        mirror.camera.aspect = width / height;
        mirror.camera.updateProjectionMatrix();
    });
}

// Update mirrors
function updateMirrors() {
    game.mirrorCameras.forEach((mirror, index) => {
        // Position cameras to look behind
        let xOffset = 0;
        if (index === 0) xOffset = -2; // Left mirror
        if (index === 2) xOffset = 2;  // Right mirror
        
        // Position camera at player location (slightly elevated)
        mirror.camera.position.set(
            game.camera.position.x + xOffset,
            2.5,
            game.player.position
        );
        
        // Rotate camera to look behind (180 degrees + main camera rotation)
        mirror.camera.rotation.x = -0.05; // Slight downward angle
        mirror.camera.rotation.y = Math.PI; // 180 degrees to look behind
        mirror.camera.rotation.z = 0;
        
        mirror.renderer.render(game.scene, mirror.camera);
    });
}

// Handle keyboard input
function onKeyDown(event) {
    game.keys[event.key.toLowerCase()] = true;
    
    if (game.gameOver) return;
    
    // Signal indicators
    if (event.key.toLowerCase() === 'q') {
        game.player.leftSignal = true;
        game.player.rightSignal = false;
        document.getElementById('left-indicator').classList.add('active');
        document.getElementById('right-indicator').classList.remove('active');
    }
    
    if (event.key.toLowerCase() === 'e') {
        game.player.rightSignal = true;
        game.player.leftSignal = false;
        document.getElementById('right-indicator').classList.add('active');
        document.getElementById('left-indicator').classList.remove('active');
    }
    
    // Lane changes
    if (event.key.toLowerCase() === 'a' && game.player.lane > 0) {
        changeLane(-1);
    }
    
    if (event.key.toLowerCase() === 'd' && game.player.lane < NUM_LANES - 1) {
        changeLane(1);
    }
}

function onKeyUp(event) {
    game.keys[event.key.toLowerCase()] = false;
}

// Change lane
function changeLane(direction) {
    const correctSignal = (direction === -1 && game.player.leftSignal) || 
                         (direction === 1 && game.player.rightSignal);
    
    if (!correctSignal) {
        game.score -= 10;
        updateScore();
        showScoreFeedback('No Signal -10', false);
    } else {
        game.player.signalUsedForLaneChange = true;
    }
    
    game.player.targetLane += direction;
    
    // Turn off signals after lane change
    setTimeout(() => {
        game.player.leftSignal = false;
        game.player.rightSignal = false;
        document.getElementById('left-indicator').classList.remove('active');
        document.getElementById('right-indicator').classList.remove('active');
    }, 500);
}

// Update speed based on input
function updateSpeed(delta) {
    if (game.keys['w'] && game.player.speed < MAX_SPEED) {
        game.player.speed += SPEED_INCREMENT;
    }
    
    if (game.keys['s'] && game.player.speed > MIN_SPEED) {
        game.player.speed -= SPEED_INCREMENT;
    }
    
    document.getElementById('speed').textContent = Math.round(game.player.speed);
}

// Update game logic
function update(delta) {
    if (game.gameOver) return;
    
    updateSpeed(delta);
    
    // Update player position
    game.player.position -= (game.player.speed / 3.6) * delta;
    
    // Smoothly move to target lane
    const targetX = LANE_POSITIONS[game.player.targetLane];
    const currentX = game.camera.position.x;
    const diff = targetX - currentX;
    
    if (Math.abs(diff) < 0.05) {
        game.player.lane = game.player.targetLane;
        game.camera.position.x = targetX;
    } else {
        game.camera.position.x += Math.sign(diff) * delta * 8;
    }
    
    game.camera.position.z = game.player.position;
    
    // Update road segments (infinite highway effect)
    game.roadSegments.forEach(segment => {
        if (segment.position.z > game.player.position + 250) {
            segment.position.z -= 2500;
        }
    });
    
    // Update lane markings
    game.laneMarkings.forEach(marking => {
        if (marking.position.z > game.player.position + 1500) {
            marking.position.z -= 3000;
        }
    });
    
    // Update road edges
    game.roadEdges.forEach(edge => {
        if (edge.position.z > game.player.position + 1500) {
            edge.position.z -= 3000;
        }
    });
    
    // Update ground segments
    game.groundSegments.forEach(ground => {
        if (ground.position.z > game.player.position + 500) {
            ground.position.z -= 5000;
        }
    });
    
    // Update traffic
    updateTraffic(delta);
    
    // Check for crashes
    checkCollisions();
    
    // Update scoring
    updateScoring(delta);
    
    // Spawn new traffic if needed
    if (game.traffic.length < 12) {
        if (Math.random() < 0.01) {
            // Spawn ahead or behind player
            const spawnAhead = Math.random() < 0.7; // 70% ahead, 30% behind
            const position = spawnAhead ? 
                game.player.position - 200 : 
                game.player.position + 100;
            
            // Randomly select driver type
            const rand = Math.random();
            let driverType, lane, speed;
            
            if (rand < 0.33) {
                // Slow driver - right lane, 100-115 km/h
                driverType = 'slow';
                lane = 1;
                speed = 100 + Math.random() * 15;
            } else if (rand < 0.66) {
                // Fast driver - left lane, 120-150 km/h
                driverType = 'fast';
                lane = 0;
                speed = 120 + Math.random() * 30;
            } else {
                // Medium driver - any lane, 110-125 km/h
                driverType = 'medium';
                lane = Math.floor(Math.random() * NUM_LANES);
                speed = 110 + Math.random() * 15;
            }
            
            game.traffic.push(createTrafficCar(lane, position, speed, driverType));
        }
    }
}

// Update traffic cars
function updateTraffic(delta) {
    game.traffic.forEach(car => {
        // Skip normal behavior if car is crashed
        if (car.crashed) {
            updateCrashedCar(car, delta);
            return;
        }
        
        // Check distance to player
        const distanceToPlayer = car.position - game.player.position;
        const sameLaneAsPlayer = car.lane === game.player.lane;
        const behindPlayer = distanceToPlayer > 0;
        const closeToPlayer = Math.abs(distanceToPlayer) < 30;
        
        // Collision avoidance: slow down if approaching player from behind
        let targetSpeed = car.speed;
        if (sameLaneAsPlayer && behindPlayer && closeToPlayer) {
            // Car is behind player in same lane
            if (distanceToPlayer < 15) {
                // Very close - match player speed or slower
                targetSpeed = Math.min(car.speed, game.player.speed - 5);
            } else if (distanceToPlayer < 25) {
                // Getting close - slow down gradually
                targetSpeed = Math.min(car.speed, game.player.speed);
            }
            
            // Track blocking time for aggressive behavior
            if (car.lane === 0 && car.speed > game.player.speed + 10) {
                // Fast car blocked by slower player in left lane
                car.blockedByPlayerTime += delta;
                
                // After 8 seconds of blocking, become aggressive and rear-end
                if (car.blockedByPlayerTime > 8) {
                    targetSpeed = car.speed; // Resume normal speed to ram player
                }
            } else {
                car.blockedByPlayerTime = 0;
            }
            
            // Try to change lanes to pass if blocked
            if (car.lane === car.targetLane && distanceToPlayer < 20 && car.speed > game.player.speed) {
                // Try to move to other lane
                const otherLane = car.lane === 0 ? 1 : 0;
                // Check if other lane is clear
                const otherLaneClear = !game.traffic.some(otherCar => {
                    return otherCar !== car && otherCar.lane === otherLane && 
                           Math.abs(otherCar.position - car.position) < 20;
                });
                if (otherLaneClear) {
                    car.targetLane = otherLane;
                }
            }
        } else {
            car.blockedByPlayerTime = 0;
        }
        
        // Smoothly adjust speed
        if (Math.abs(car.speed - targetSpeed) > 0.1) {
            car.speed += (targetSpeed - car.speed) * delta * 2;
        }
        
        // Move car
        car.position -= (car.speed / 3.6) * delta;
        car.mesh.position.z = car.position;
        
        // AI lane change logic based on driver type
        if (car.lane === car.targetLane) {
            if (car.driverType === 'slow') {
                // Slow drivers stay in right lane
                if (car.lane !== 1) {
                    car.targetLane = 1;
                }
            } else if (car.driverType === 'fast') {
                // Fast drivers stay in left lane
                if (car.lane !== 0) {
                    car.targetLane = 0;
                }
            } else if (car.driverType === 'medium') {
                // Medium drivers change lanes as necessary
                if (Math.random() < 0.002) {
                    const newLane = Math.floor(Math.random() * NUM_LANES);
                    if (newLane !== car.lane) {
                        car.targetLane = newLane;
                    }
                }
            }
        }
        
        // Smoothly move to target lane
        if (car.lane !== car.targetLane) {
            const targetX = LANE_POSITIONS[car.targetLane];
            const currentX = car.mesh.position.x;
            const diff = targetX - currentX;
            
            if (Math.abs(diff) < 0.1) {
                car.lane = car.targetLane;
                car.mesh.position.x = targetX;
            } else {
                car.mesh.position.x += Math.sign(diff) * delta * 2;
            }
        }
    });
    
    // Check for AI car collisions (not including player)
    checkAICarCollisions();
    
    // Reposition cars that are too far away instead of removing them
    game.traffic.forEach(car => {
        // Car is too far behind - reposition ahead (and make it slower)
        if (car.position > game.player.position + 300) {
            car.position = game.player.position - 150 - Math.random() * 100;
            car.mesh.position.z = car.position;
            
            // Make it slower than player so player can catch up
            const maxSpeed = game.player.speed - 5;
            const minSpeed = Math.max(95, maxSpeed - 20);
            car.speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            // Update driver type based on new speed
            if (car.speed < 110) {
                car.driverType = 'slow';
            } else if (car.speed < 120) {
                car.driverType = 'medium';
            } else {
                car.driverType = 'fast';
            }
        }
        // Car is too far ahead - reposition behind (and make it faster)
        else if (car.position < game.player.position - 350) {
            car.position = game.player.position + 100 + Math.random() * 100;
            car.mesh.position.z = car.position;
            
            // Make it faster than player so it can catch up
            const minSpeed = game.player.speed + 5;
            const maxSpeed = Math.min(150, minSpeed + 20);
            car.speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            // Update driver type based on new speed
            if (car.speed < 110) {
                car.driverType = 'slow';
            } else if (car.speed < 120) {
                car.driverType = 'medium';
            } else {
                car.driverType = 'fast';
            }
        }
    });
    
    // Ensure we always have at least 1 car ahead and 1 car behind
    ensureMinimumTraffic();
}

// Ensure minimum traffic distribution around player
function ensureMinimumTraffic() {
    // Count cars ahead and behind player
    const carsAhead = game.traffic.filter(car => car.position < game.player.position).length;
    const carsBehind = game.traffic.filter(car => car.position > game.player.position).length;
    
    // When player is at minimum speed, prioritize spawning behind
    const isAtMinSpeed = game.player.speed <= 105; // Within 5 km/h of minimum
    
    // Adjust minimum requirements based on player speed
    const minCarsAhead = isAtMinSpeed ? 0 : 1;
    const minCarsBehind = isAtMinSpeed ? 2 : 1;
    
    // Need at least minimum cars ahead (unless at min speed)
    if (carsAhead < minCarsAhead) {
        let attempts = 0;
        let spawned = false;
        
        while (!spawned && attempts < 10) {
            const position = game.player.position - 80 - Math.random() * 60;
            let driverType, lane, speed;
            
            // Car ahead should be slower than player (so player can catch up)
            const maxSpeed = game.player.speed - 5; // At least 5 km/h slower
            const minSpeed = Math.max(95, maxSpeed - 20); // Don't go below 95 km/h
            
            speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            // Assign driver type and lane based on speed
            if (speed < 110) {
                driverType = 'slow';
                lane = 1; // Right lane
            } else if (speed < 120) {
                driverType = 'medium';
                lane = Math.floor(Math.random() * NUM_LANES);
            } else {
                driverType = 'fast';
                lane = 0; // Left lane
            }
            
            if (isSpawnPositionSafe(lane, position)) {
                game.traffic.push(createTrafficCar(lane, position, speed, driverType));
                spawned = true;
            }
            attempts++;
        }
    }
    
    // Need at least minimum cars behind (more when at min speed)
    if (carsBehind < minCarsBehind) {
        let attempts = 0;
        let spawned = false;
        
        while (!spawned && attempts < 10) {
            const position = game.player.position + 60 + Math.random() * 40;
            let driverType, lane, speed;
            
            // Car behind should be faster than player (so it can catch up)
            const minSpeed = game.player.speed + 5; // At least 5 km/h faster
            const maxSpeed = Math.min(150, minSpeed + 20); // Don't exceed 150 km/h
            
            speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            // Assign driver type and lane based on speed
            if (speed < 110) {
                driverType = 'slow';
                lane = 1; // Right lane
            } else if (speed < 120) {
                driverType = 'medium';
                lane = Math.floor(Math.random() * NUM_LANES);
            } else {
                driverType = 'fast';
                lane = 0; // Left lane
            }
            
            if (isSpawnPositionSafe(lane, position)) {
                game.traffic.push(createTrafficCar(lane, position, speed, driverType));
                spawned = true;
            }
            attempts++;
        }
    }
}

// Check for collisions between AI cars
function checkAICarCollisions() {
    for (let i = 0; i < game.traffic.length; i++) {
        const car1 = game.traffic[i];
        if (car1.crashed) continue;
        
        for (let j = i + 1; j < game.traffic.length; j++) {
            const car2 = game.traffic[j];
            if (car2.crashed) continue;
            
            // Check if cars are in same lane
            if (car1.lane === car2.lane) {
                const distance = Math.abs(car1.position - car2.position);
                
                // Crash if very close (within 4 units)
                if (distance < 4) {
                    // Both cars crash
                    initiateCrash(car1);
                    initiateCrash(car2);
                }
            }
        }
    }
}

// Initiate crash for a car
function initiateCrash(car) {
    car.crashed = true;
    car.crashTime = 0;
    car.originalY = car.mesh.position.y;
    // Random direction to fly off (left or right)
    car.crashDirection = Math.random() < 0.5 ? -1 : 1;
}

// Update crashed car animation
function updateCrashedCar(car, delta) {
    car.crashTime += delta;
    
    const crashDuration = 3; // Total crash animation duration in seconds
    
    if (car.crashTime < crashDuration) {
        // Phase 1: Shake and bounce (first 0.5 seconds)
        if (car.crashTime < 0.5) {
            // Shake violently
            car.mesh.rotation.y = Math.sin(car.crashTime * 50) * 0.3;
            car.mesh.rotation.x = Math.sin(car.crashTime * 40) * 0.2;
            car.mesh.rotation.z = Math.sin(car.crashTime * 60) * 0.2;
            
            // Bounce up
            car.mesh.position.y = car.originalY + Math.abs(Math.sin(car.crashTime * 15)) * 2;
        }
        // Phase 2: Fly off to the side (0.5 to 3 seconds)
        else {
            const flyTime = car.crashTime - 0.5;
            
            // Continue bouncing but decreasing
            car.mesh.position.y = car.originalY + Math.abs(Math.sin(flyTime * 8)) * (2 - flyTime * 0.8);
            
            // Spin around
            car.mesh.rotation.y += delta * 5 * car.crashDirection;
            car.mesh.rotation.x += delta * 3;
            
            // Move sideways into the grass
            car.mesh.position.x += car.crashDirection * delta * 8;
            
            // Slow down but keep moving
            car.speed *= 0.95;
            car.position -= (car.speed / 3.6) * delta;
            car.mesh.position.z = car.position;
        }
    } else {
        // Remove car after animation completes
        game.scene.remove(car.mesh);
        const index = game.traffic.indexOf(car);
        if (index > -1) {
            game.traffic.splice(index, 1);
        }
    }
}

// Check for collisions
function checkCollisions() {
    for (let car of game.traffic) {
        if (car.crashed) continue; // Skip crashed cars
        
        const distance = Math.abs(car.position - game.player.position);
        const sameLane = car.lane === game.player.lane;
        
        if (sameLane && distance < CRASH_DISTANCE) {
            gameOver('Crash! You hit another vehicle.');
            return;
        }
    }
}

// Update scoring system
function updateScoring(delta) {
    game.scoreTimer += delta;
    game.feedbackDebounce = Math.max(0, game.feedbackDebounce - delta);
    
    if (game.scoreTimer >= 1) {
        game.scoreTimer = 0;
        
        let shouldIncreasePoints = false;
        let shouldDecreasePoints = false;
        let feedbackReason = null;
        
        // Base points for driving
        if (game.player.speed > 30) {
            shouldIncreasePoints = true;
            feedbackReason = 'driving';
        }
        
        // Check for penalties
        
        // 1. Tailgating - player following another car too closely
        for (let car of game.traffic) {
            if (car.crashed) continue; // Skip crashed cars
            
            const distance = game.player.position - car.position; // Car ahead means car.position < player.position
            const sameLane = car.lane === game.player.lane;
            
            if (sameLane && distance > 0 && distance < TAILGATE_DISTANCE) {
                shouldDecreasePoints = true;
                shouldIncreasePoints = false;
                feedbackReason = 'tailgating';
            }
        }
        
        // 2. Being in left lane unnecessarily (when not passing)
        if (game.player.lane === 0) { // Leftmost lane
            const passingRange = TAILGATE_DISTANCE * 2;
            const passingVehicle = game.traffic.some(car => {
                if (car.crashed) return false; // Skip crashed cars
                const distance = Math.abs(car.position - game.player.position);
                return car.lane === 1 && distance <= passingRange;
            });
            
            if (!passingVehicle) {
                shouldDecreasePoints = true;
                shouldIncreasePoints = false;
                feedbackReason = 'left_lane';
            }
            
            // 3. Being in left lane while someone is behind you
            for (let car of game.traffic) {
                if (car.crashed) continue; // Skip crashed cars
                
                const behind = car.position > game.player.position;
                const close = Math.abs(car.position - game.player.position) < 50;
                
                if (car.lane === 0 && behind && close && car.speed > game.player.speed) {
                    shouldDecreasePoints = true;
                    shouldIncreasePoints = false;
                    feedbackReason = 'blocking';
                    break;
                }
            }
        }
        
        // Show feedback if reason changed and not on cooldown
        if (feedbackReason !== game.lastFeedbackReason && game.feedbackDebounce <= 0) {
            if (feedbackReason === 'driving') {
                showScoreFeedback('Good Driving', true);
            } else if (feedbackReason === 'tailgating') {
                showScoreFeedback('Following too close', false);
            } else if (feedbackReason === 'left_lane') {
                showScoreFeedback('Wrong Lane', false);
            } else if (feedbackReason === 'blocking') {
                showScoreFeedback('Blocking Traffic', false);
            }
            game.lastFeedbackReason = feedbackReason;
            game.feedbackDebounce = 3; // 3 second cooldown
        }
        
        // Apply point animations based on conditions
        if (shouldDecreasePoints) {
            startDecreasingPoints();
        } else if (shouldIncreasePoints) {
            startIncreasingPoints();
        } else {
            stopAllPointAnimations();
            game.lastFeedbackReason = null;
        }
    }
}

// Update score display
function updateScore() {
    game.score = Math.max(0, game.score);
    document.getElementById('score').textContent = game.score;
}

// Show score feedback message
let feedbackTimeout = null;
function showScoreFeedback(message, isPositive = true) {
    const feedbackElement = document.getElementById('score-feedback');
    
    // Clear any existing timeout
    if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
    }
    
    // Remove existing classes and animation
    feedbackElement.classList.remove('show', 'positive', 'negative');
    feedbackElement.style.animation = 'none';
    
    // Set message and style
    feedbackElement.textContent = message;
    feedbackElement.classList.add(isPositive ? 'positive' : 'negative');
    
    // Trigger show with a small delay to restart animation
    setTimeout(() => {
        feedbackElement.classList.add('show');
    }, 10);
    
    // Fade out after 2.5 seconds
    feedbackTimeout = setTimeout(() => {
        feedbackElement.style.animation = 'fadeOut 0.5s forwards';
        
        // Remove show class after animation
        setTimeout(() => {
            feedbackElement.classList.remove('show');
            feedbackElement.style.animation = 'none';
        }, 500);
    }, 2500);
}

// Start increasing points gradually
function startIncreasingPoints() {
    if (game.pointsAnimation.increasing) return; // Already increasing
    
    stopDecreasingPoints(); // Stop any decreasing animation
    game.pointsAnimation.increasing = true;
    
    // Increase by 1 point every `increaseInterval` ms
    let increaseInterval = 250;
    game.pointsAnimation.increaseInterval = setInterval(() => {
        if (!game.gameOver && game.pointsAnimation.increasing) {
            game.score += 1;
            updateScore();
        }
    }, increaseInterval);
}

// Stop increasing points
function stopIncreasingPoints() {
    if (game.pointsAnimation.increaseInterval) {
        clearInterval(game.pointsAnimation.increaseInterval);
        game.pointsAnimation.increaseInterval = null;
    }
    game.pointsAnimation.increasing = false;
}

// Start decreasing points gradually
function startDecreasingPoints() {
    if (game.pointsAnimation.decreasing) return; // Already decreasing
    
    stopIncreasingPoints(); // Stop any increasing animation
    game.pointsAnimation.decreasing = true;
    
    // Decrease by 1 point every `decreaseInterval` ms
    let decreaseInterval = 50;
    game.pointsAnimation.decreaseInterval = setInterval(() => {
        if (!game.gameOver && game.pointsAnimation.decreasing) {
            game.score -= 1;
            updateScore();
        }
    }, decreaseInterval);
}

// Stop decreasing points
function stopDecreasingPoints() {
    if (game.pointsAnimation.decreaseInterval) {
        clearInterval(game.pointsAnimation.decreaseInterval);
        game.pointsAnimation.decreaseInterval = null;
    }
    game.pointsAnimation.decreasing = false;
}

// Stop all point animations
function stopAllPointAnimations() {
    stopIncreasingPoints();
    stopDecreasingPoints();
}

// Game over
function gameOver(reason) {
    game.gameOver = true;
    stopAllPointAnimations(); // Clean up point animation intervals
    document.getElementById('final-score').textContent = `Final Score: ${game.score}`;
    document.getElementById('game-over-reason').textContent = reason;
    document.getElementById('game-over').classList.remove('hidden');
}

// Restart game
function restart() {
    // Stop all point animations
    stopAllPointAnimations();
    
    // Remove all traffic
    game.traffic.forEach(car => game.scene.remove(car.mesh));
    game.traffic = [];
    
    // Reset player
    game.player.speed = 100;
    game.player.lane = 1;
    game.player.targetLane = 1;
    game.player.position = 0;
    game.player.leftSignal = false;
    game.player.rightSignal = false;
    
    // Reset camera
    game.camera.position.set(LANE_POSITIONS[1], 2.5, -2);
    game.camera.rotation.x = -0.1;
    
    // Reset road segments to initial positions
    const roadLength = 500;
    game.roadSegments.forEach((segment, i) => {
        segment.position.z = (i - 2) * roadLength;
    });
    
    // Reset lane markings to initial positions
    let markingIndex = 0;
    for (let lane = 0; lane < NUM_LANES - 1; lane++) {
        for (let z = -1500; z < 1500; z += 15) {
            if (markingIndex < game.laneMarkings.length) {
                game.laneMarkings[markingIndex].position.z = z;
                markingIndex++;
            }
        }
    }
    
    // Reset road edges to initial positions
    let edgeIndex = 0;
    for (let side of [-1, 1]) {
        for (let z = -1500; z < 1500; z += 10) {
            if (edgeIndex < game.roadEdges.length) {
                game.roadEdges[edgeIndex].position.z = z;
                edgeIndex++;
            }
        }
    }
    
    // Reset ground segments to initial positions
    let groundIndex = 0;
    for (let side of [-1, 1]) {
        for (let i = -2; i <= 2; i++) {
            if (groundIndex < game.groundSegments.length) {
                game.groundSegments[groundIndex].position.z = i * 1000;
                groundIndex++;
            }
        }
    }
    
    // Reset score
    game.score = 1000;
    game.scoreTimer = 0;
    game.lastFeedbackReason = null;
    game.feedbackDebounce = 0;
    updateScore();
    
    // Reset game over
    game.gameOver = false;
    document.getElementById('game-over').classList.add('hidden');
    
    // Turn off signal indicators
    document.getElementById('left-indicator').classList.remove('active');
    document.getElementById('right-indicator').classList.remove('active');
    
    // Spawn new traffic
    spawnTraffic();
}

// Handle window resize
function onWindowResize() {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    resizeMirrors();
}

// Animation loop
let lastTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    if (delta > 0 && delta < 0.1) {
        update(delta);
    }
    
    game.renderer.render(game.scene, game.camera);
    updateMirrors();
}

// Start the game when page loads
window.addEventListener('load', init);
