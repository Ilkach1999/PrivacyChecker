let riskCount = 0;
const findings = [];

// PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-btn').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
    document.getElementById('install-btn').classList.add('hidden');
    deferredPrompt = null;
});
function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            document.getElementById('install-btn').classList.add('hidden');
        });
    }
}

// Вспомогательные функции
function setResult(id, status, detail, isRisk) {
    document.getElementById(id + '-status').textContent = status;
    document.getElementById(id + '-detail').textContent = detail;
    if (isRisk) riskCount++;
    findings.push({ id, status, detail, isRisk });
}

function showVerdict() {
    const vStatus = document.getElementById('verdict-status');
    const vDetail = document.getElementById('verdict-detail');

    if (riskCount === 0) {
        vStatus.textContent = '✅ Всё чисто';
        vStatus.className = 'status safe';
        vDetail.textContent = 'Браузер не обнаружил явных признаков слежки. Но помни: это лишь то, что видно браузеру. Системные трекеры (на уровне прошивки) так не найти.';
    } else if (riskCount <= 2) {
        vStatus.textContent = '⚠️ Есть подозрения';
        vStatus.className = 'status warn';
        vDetail.textContent = 'Найдено ' + riskCount + ' подозрительных фактора. Возможно, фоновые приложения имеют доступ к твоим данным. Проверь настройки телефона.';
    } else {
        vStatus.textContent = '🚨 Высокий риск';
        vStatus.className = 'status danger';
        vDetail.textContent = 'Обнаружено ' + riskCount + ' факторов утечки. Настоятельно рекомендую: 1) Проверить Спецвозможности в настройках, 2) Удалить подозрительные приложения, 3) Сбросить разрешения.';
    }
}

// Проверки
async function runChecks() {
    riskCount = 0;
    findings.length = 0;

    // 1. Микрофон
    try {
        const micPerm = await navigator.permissions.query({ name: 'microphone' });
        if (micPerm.state === 'granted') {
            setResult('mic', '⚠️ Доступ разрешён', 'Какое-то приложение или вкладка может слушать микрофон прямо сейчас.', true);
        } else if (micPerm.state === 'prompt') {
            setResult('mic', '⚠️ Запрашивается', 'Сайт запрашивает доступ к микрофону при открытии.', true);
        } else {
            setResult('mic', '✅ Заблокирован', 'Доступ к микрофону не разрешён.', false);
        }
    } catch (e) {
        setResult('mic', '❓ Нет данных', 'Браузер не даёт проверить разрешение микрофона.', false);
    }

    // 2. Камера
    try {
        const camPerm = await navigator.permissions.query({ name: 'camera' });
        if (camPerm.state === 'granted') {
            setResult('cam', '⚠️ Доступ разрешён', 'Приложение может видеть камеру. Проверь, кому ты дал это право.', true);
        } else if (camPerm.state === 'prompt') {
            setResult('cam', '⚠️ Запрашивается', 'Сайт пытается получить доступ к камере.', true);
        } else {
            setResult('cam', '✅ Заблокирован', 'Камера недоступна для сайтов.', false);
        }
    } catch (e) {
        setResult('cam', '❓ Нет данных', 'Браузер не даёт проверить камеру.', false);
    }

    // 3. Геолокация
    try {
        const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
        if (geoPerm.state === 'granted') {
            setResult('geo', '⚠️ Доступ разрешён', 'Твоё местоположение могут отслеживать.', true);
        } else if (geoPerm.state === 'prompt') {
            setResult('geo', '⚠️ Запрашивается', 'Сайт хочет знать, где ты.', true);
        } else {
            setResult('geo', '✅ Заблокирован', 'Геолокация скрыта.', false);
        }
    } catch (e) {
        setResult('geo', '❓ Нет данных', 'Не удалось проверить.', false);
    }

    // 4. Уведомления
    try {
        const notifPerm = await navigator.permissions.query({ name: 'notifications' });
        if (notifPerm.state === 'granted') {
            setResult('notif', '⚠️ Разрешены', 'Сайт может слать уведомления и работать в фоне.', true);
        } else {
            setResult('notif', '✅ Заблокированы', 'Уведомления не разрешены.', false);
        }
    } catch (e) {
        setResult('notif', '❓ Нет данных', '', false);
    }

    // 5. Сеть (WebRTC leak)
    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        pc.onicecandidate = (ice) => {
            if (ice && ice.candidate && ice.candidate.candidate) {
                const candidate = ice.candidate.candidate;
                if (candidate.includes('srflx') || candidate.includes('relay')) {
                    setResult('net', '⚠️ Обнаружен IP', 'WebRTC может раскрывать твой реальный IP даже через VPN.', true);
                } else {
                    setResult('net', '✅ Локальный IP', 'WebRTC показывает только внутренний адрес.', false);
                }
            } else {
                setResult('net', '✅ Нет утечки', 'WebRTC-кандидаты не обнаружены.', false);
            }
            pc.close();
        };
        setTimeout(() => {
            if (document.getElementById('net-status').textContent === 'Проверка...') {
                setResult('net', '✅ Таймаут', 'WebRTC-проверка не дала результата.', false);
                pc.close();
            }
        }, 3000);
    } catch (e) {
        setResult('net', '❓ Ошибка', 'Не удалось проверить WebRTC.', false);
    }

    // 6. Батарея (признак фоновой активности)
    try {
        const battery = await navigator.getBattery();
        const level = Math.round(battery.level * 100);
        const charging = battery.charging;
        let detail = `Заряд: ${level}%. `;
        if (!charging && level < 20) {
            detail += 'Телефон быстро разряжается — возможна фоновая активность.';
            setResult('battery', '⚠️ Быстрый разряд', detail, true);
        } else if (charging) {
            detail += 'На зарядке.';
            setResult('battery', '⚡ На зарядке', detail, false);
        } else {
            detail += 'Уровень в норме.';
            setResult('battery', '✅ Норма', detail, false);
        }
    } catch (e) {
        setResult('battery', '❓ Нет данных', 'Battery API не поддерживается.', false);
    }

    showVerdict();
}

runChecks();