// HighWay - Driving Simulator Game
// Main game logic

// Game constants
const LANE_WIDTH = 4;
const NUM_LANES = 2;
const HIGHWAY_WIDTH = LANE_WIDTH * NUM_LANES;
const MIN_SPEED = 100;
const MAX_SPEED = 140;
const SPEED_INCREMENT = 0.05;
const CRASH_DISTANCE = 3;
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
    score: 1000,
    scoreTimer: 0,
    gameOver: false,
    keys: {},
    roadSegments: [],
    laneMarkings: [],
    roadEdges: [],
    groundSegments: [],
    mirrorCameras: [],
    mirrorScenes: []
};

// Initialize the game
function init() {
    // Set up scene
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x87CEEB);
    game.scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

    // Set up camera (first-person view from inside car)
    game.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    game.camera.position.set(LANE_POSITIONS[1], 2.5, 0);
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
    const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    for (let i = -2; i <= 2; i++) {
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.z = i * roadLength;
        game.scene.add(road);
        game.roadSegments.push(road);
    }

    // Lane markings
    const markingGeometry = new THREE.PlaneGeometry(0.3, 5);
    const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    
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
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    
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

    // Ground beside road
    const groundGeometry = new THREE.PlaneGeometry(200, 1000);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    
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
    dashboard.position.set(0, -1.2, -1.5);
    game.camera.add(dashboard);
    
    // Steering wheel
    const wheelRadius = 0.4;
    const wheelTube = 0.05;
    const steeringWheelGeometry = new THREE.TorusGeometry(wheelRadius, wheelTube, 16, 32);
    const steeringWheelMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const steeringWheel = new THREE.Mesh(steeringWheelGeometry, steeringWheelMaterial);
    steeringWheel.position.set(0, -0.8, -1.2);
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
    gauge.position.set(0.6, -0.5, -1);
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
    leftPillar.position.set(-1.8, 0.3, -1.5);
    leftPillar.rotation.z = 0.3; // Angle outward
    game.camera.add(leftPillar);
    
    // Windshield frame - right A-pillar (angled)
    const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    rightPillar.position.set(1.8, 0.3, -1.5);
    rightPillar.rotation.z = -0.3; // Angle outward
    game.camera.add(rightPillar);
    
    // Top windshield frame
    const topFrameGeometry = new THREE.BoxGeometry(3.8, 0.12, 0.08);
    const topFrame = new THREE.Mesh(topFrameGeometry, pillarMaterial);
    topFrame.position.set(0, 1.5, -1.5);
    game.camera.add(topFrame);
    
    // Roof (interior ceiling)
    const roofGeometry = new THREE.BoxGeometry(5, 0.3, 3);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, 1.3, -1);
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
        driverType: driverType
    };
}

// Spawn traffic
function spawnTraffic() {
    const numCars = 8;
    
    for (let i = 0; i < numCars; i++) {
        // Spawn cars both ahead and behind player
        const position = -200 + Math.random() * 400; // Range: -200 to +200
        
        // Randomly select driver type
        const rand = Math.random();
        let driverType, lane, speed;
        
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
        
        game.traffic.push(createTrafficCar(lane, position, speed, driverType));
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
        const mirrorRenderer = new THREE.WebGLRenderer({ antialias: true });
        mirrorRenderer.setSize(width, height);
        mirrorRenderer.domElement.style.width = '100%';
        mirrorRenderer.domElement.style.height = '100%';
        mirrorElement.appendChild(mirrorRenderer.domElement);
        
        // Create camera for this mirror
        const mirrorCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
        
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
        
        mirror.camera.position.set(
            game.camera.position.x + xOffset,
            3,
            game.player.position
        );
        mirror.camera.lookAt(
            game.camera.position.x + xOffset,
            2,
            game.player.position + 30
        );
        
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
    
    // Remove cars that are too far behind
    game.traffic = game.traffic.filter(car => {
        if (car.position > game.player.position + 300) {
            game.scene.remove(car.mesh);
            return false;
        }
        return true;
    });
}

// Check for collisions
function checkCollisions() {
    for (let car of game.traffic) {
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
    
    if (game.scoreTimer >= 1) {
        game.scoreTimer = 0;
        
        // Base points for driving
        if (game.player.speed > 30) {
            game.score += 1;
        }
        
        // Check for penalties
        
        // 1. Tailgating
        for (let car of game.traffic) {
            const distance = car.position - game.player.position;
            const sameLane = car.lane === game.player.lane;
            
            if (sameLane && distance > 0 && distance < TAILGATE_DISTANCE) {
                game.score -= 5;
            }
        }
        
        // 2. Being in left lane unnecessarily (when not passing)
        if (game.player.lane === 0) { // Leftmost lane
            const passingRange = TAILGATE_DISTANCE * 2;
            const passingVehicle = game.traffic.some(car => {
                const distance = Math.abs(car.position - game.player.position);
                return car.lane === 1 && distance <= passingRange;
            });
            
            if (!passingVehicle) {
                game.score -= 3;
            }
            
            // 3. Being in left lane while someone is behind you
            for (let car of game.traffic) {
                const behind = car.position > game.player.position;
                const close = Math.abs(car.position - game.player.position) < 50;
                
                if (car.lane === 0 && behind && close && car.speed > game.player.speed) {
                    game.score -= 5;
                    break;
                }
            }
        }
        
        updateScore();
    }
}

// Update score display
function updateScore() {
    game.score = Math.max(0, game.score);
    document.getElementById('score').textContent = game.score;
}

// Game over
function gameOver(reason) {
    game.gameOver = true;
    document.getElementById('final-score').textContent = `Final Score: ${game.score}`;
    document.getElementById('game-over-reason').textContent = reason;
    document.getElementById('game-over').classList.remove('hidden');
}

// Restart game
function restart() {
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
    
    // Reset score
    game.score = 1000;
    game.scoreTimer = 0;
    updateScore();
    
    // Reset game over
    game.gameOver = false;
    document.getElementById('game-over').classList.add('hidden');
    
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
