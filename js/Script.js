
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
async function saveCanvas(canvas, format, filename, background = '#ffffff') {
    if (format === 'pdf') {
        const pdf = new window.jspdf.jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px', format: [canvas.width, canvas.height]
        });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(filename + '.pdf');
        return;
    }
    let image = canvas;
    if (format === 'jpg') {
        image = document.createElement('canvas');
        image.width = canvas.width; image.height = canvas.height;
        const ctx = image.getContext('2d');
        ctx.fillStyle = background; ctx.fillRect(0, 0, image.width, image.height);
        ctx.drawImage(canvas, 0, 0);
    }
    const blob = await new Promise((resolve, reject) => image.toBlob(
        result => result ? resolve(result) : reject(new Error('Не удалось создать изображение')),
        format === 'png' ? 'image/png' : 'image/jpeg', 0.95));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename + '.' + format;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Export dependencies are shared and loaded only when requested.
const exportLibraries = new Map();
function loadExportLibrary(url, available) {
    if (available()) return Promise.resolve();
    if (!exportLibraries.has(url)) {
        const pending = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => available() ? resolve() : reject(new Error('Библиотека недоступна'));
            script.onerror = () => { script.remove(); reject(new Error('Не удалось загрузить библиотеку экспорта. Проверьте интернет.')); };
            document.head.appendChild(script);
        }).catch(error => { exportLibraries.delete(url); throw error; });
        exportLibraries.set(url, pending);
    }
    return exportLibraries.get(url);
}
async function prepareExport(format) {
    const jobs = [loadExportLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => !!window.html2canvas)];
    if (format === 'pdf') jobs.push(loadExportLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => !!window.jspdf));
    await Promise.all(jobs);
    if (document.fonts) await document.fonts.ready;
}

/* ==================== ТРЕКЕР НАСТРОЕНИЯ ==================== */
(function() {
    const LEVEL_COUNT = 7;
    const LEVELS_INFO = [
        { level: 1, emoji: '🌑', label: 'Ужасно' },
        { level: 2, emoji: '🌒', label: 'Плохо' },
        { level: 3, emoji: '🌓', label: 'Так себе' },
        { level: 4, emoji: '🌔', label: 'Норм' },
        { level: 5, emoji: '🌕', label: 'Хорошо' },
        { level: 6, emoji: '⭐', label: 'Отлично' },
        { level: 7, emoji: '🌟', label: 'Космос' }
    ];
    const EMOJIS = LEVELS_INFO.map(item => item.emoji);
    const LABELS = LEVELS_INFO.map(item => item.label);
    const LEVELS = LEVELS_INFO.map(item => item.level);

    let students = [];
    let currentDate = new Date().toISOString().slice(0, 10);
    let moodData = {};
    let lockedDays = {};
    let activeDragIndex = -1;
    let pendingDragY = null;
    let dragFrame = 0;
    let moodDirty = false;
    let averageCache = null;
    const chartStates = new Map();

    const datePicker = document.getElementById('datePicker');
    const plotArea = document.getElementById('plotArea');
    const yAxisEl = document.getElementById('yAxis');
    const svgLines = document.getElementById('constellation-lines');
    const btnSettings = document.getElementById('btnSettings');
    const settingsContent = document.getElementById('settingsContent');
    const settingsDropdown = document.getElementById('settingsDropdown');
    const btnStudents = document.getElementById('btnStudents');
    const btnDownload = document.getElementById('btnDownload');
    const btnAverage = document.getElementById('btnAverage');
    const btnDownloadAverage = document.getElementById('btnDownloadAverage');
    const btnReset = document.getElementById('btnReset');
    const btnCloseDay = document.getElementById('btnCloseDay');
    const modalStudents = document.getElementById('modalStudents');
    const studentListText = document.getElementById('studentListText');
    const btnCancelStudents = document.getElementById('btnCancelStudents');
    const btnSaveStudents = document.getElementById('btnSaveStudents');
    const modalDownload = document.getElementById('modalDownload');
    const btnDownloadPNG = document.getElementById('btnDownloadPNG');
    const btnDownloadJPG = document.getElementById('btnDownloadJPG');
    const btnDownloadPDF = document.getElementById('btnDownloadPDF');
    const btnCancelDownload = document.getElementById('btnCancelDownload');
    const modalDownloadAverage = document.getElementById('modalDownloadAverage');
    const btnDownloadAveragePNG = document.getElementById('btnDownloadAveragePNG');
    const btnDownloadAverageJPG = document.getElementById('btnDownloadAverageJPG');
    const btnDownloadAveragePDF = document.getElementById('btnDownloadAveragePDF');
    const btnCancelDownloadAverage = document.getElementById('btnCancelDownloadAverage');
    const modalReset = document.getElementById('modalReset');
    const btnResetDay = document.getElementById('btnResetDay');
    const btnResetAll = document.getElementById('btnResetAll');
    const btnCancelReset = document.getElementById('btnCancelReset');
    const modalAverage = document.getElementById('modalAverage');
    const btnCloseAverage = document.getElementById('btnCloseAverage');
    const averageYAxis = document.getElementById('averageYAxis');
    const averagePlotArea = document.getElementById('averagePlotArea');
    const averageSvgLines = document.getElementById('averageConstellationLines');
    const chartContainer = document.getElementById('chartContainer');
    const averageChartContainer = document.getElementById('averageChartContainer');

    function init() {
        loadStudentsFromStorage();
        loadMoodDataFromStorage();
        loadLockedDaysFromStorage();
        datePicker.value = currentDate;
        buildYAxis(yAxisEl);
        buildAverageYAxis();
        updateDateDisplay();
        bindEvents();
    }

    function loadStudentsFromStorage() {
        const stored = localStorage.getItem('moodTrackerStudents');
        if (stored) {
            try {
                students = JSON.parse(stored);
                if (!Array.isArray(students)) students = [];
            } catch (e) {
                students = [];
            }
        }
        if (students.length === 0) {
            students = Array.from({ length: 30 }, (_, i) => `Участник ${i + 1}`);
        }
    }

    function saveStudentsToStorage() {
        localStorage.setItem('moodTrackerStudents', JSON.stringify(students));
    }

    function loadMoodDataFromStorage() {
        const stored = localStorage.getItem('moodTrackerData');
        if (stored) {
            try { moodData = JSON.parse(stored); } catch (e) { moodData = {}; }
        }
    }

    function saveMoodDataToStorage() {
        localStorage.setItem('moodTrackerData', JSON.stringify(moodData));
        moodDirty = false;
        averageCache = null;
    }

    function loadLockedDaysFromStorage() {
        const stored = localStorage.getItem('moodTrackerLockedDays');
        if (stored) {
            try { lockedDays = JSON.parse(stored); } catch (e) { lockedDays = {}; }
        }
    }

    function saveLockedDaysToStorage() {
        localStorage.setItem('moodTrackerLockedDays', JSON.stringify(lockedDays));
    }

    function isDayLocked(date) {
        return !!lockedDays[date];
    }

    function buildYAxis(element) {
        element.innerHTML = '';
        for (let i = LEVEL_COUNT - 1; i >= 0; i--) {
            const level = LEVELS[i];
            const emoji = EMOJIS[i];
            const label = LABELS[i];
            const container = document.createElement('div');
            container.className = 'emoji-level';
            container.dataset.level = level;
            const emojiSpan = document.createElement('span');
            emojiSpan.textContent = emoji;
            emojiSpan.style.fontSize = 'var(--emoji-size)';
            emojiSpan.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.8))';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'level-label';
            labelSpan.textContent = label;
            container.appendChild(emojiSpan);
            container.appendChild(labelSpan);
            element.appendChild(container);
        }
    }

    function buildChart() {
        if (!plotArea.clientWidth) return;
        renderChart(plotArea, svgLines, students.map((_, index) => getStudentLevel(index)), 140, isDayLocked(currentDate));
        updateCloseDayButton();
    }

    function buildAverageChart() {
        if (!averagePlotArea.clientWidth) return;
        if (!averageCache || averageCache.length !== students.length) {
            const sums = new Float64Array(students.length);
            const counts = new Uint32Array(students.length);
            for (const day of Object.values(moodData)) {
                if (!day) continue;
                for (const key of Object.keys(day)) {
                    const index = Number(key);
                    if (Number.isInteger(index) && index >= 0 && index < students.length) {
                        sums[index] += day[key];
                        counts[index]++;
                    }
                }
            }
            averageCache = students.map((_, index) => counts[index] ? sums[index] / counts[index] : 4);
        }
        renderChart(averagePlotArea, averageSvgLines, averageCache, 50, false);
    }

    function renderChart(area, svg, values, bottomPadding, locked) {
        const width = area.clientWidth;
        const height = area.clientHeight;
        let state = chartStates.get(area);
        if (!state) {
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            for (const [key, value] of Object.entries({fill:'none', stroke:'rgba(255, 204, 0, 0.6)', 'stroke-width':'2.5', 'stroke-linejoin':'round', 'stroke-linecap':'round', 'stroke-dasharray':'5 5'})) polyline.setAttribute(key, value);
            polyline.style.filter = 'drop-shadow(0 0 6px gold)';
            svg.appendChild(polyline);
            state = { stars: [], labels: [], lines: [], points: [], polyline, width, height };
            chartStates.set(area, state);
        }
        while (state.stars.length > values.length) {
            state.stars.pop().remove(); state.labels.pop().remove(); state.lines.pop().remove();
        }
        const fragment = document.createDocumentFragment();
        const lineFragment = document.createDocumentFragment();
        while (state.stars.length < values.length) {
            const index = state.stars.length;
            const star = document.createElement('div');
            star.className = area === plotArea ? 'student-star' : 'student-star average-star';
            star.textContent = '★'; star.dataset.index = index;
            const label = document.createElement('div');
            label.className = 'student-label'; label.dataset.index = index;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
            line.setAttribute('stroke-width', '1'); line.setAttribute('stroke-dasharray', '2 3');
            state.stars.push(star); state.labels.push(label); state.lines.push(line);
            fragment.append(star, label); lineFragment.appendChild(line);
        }
        state.width = width; state.height = height; state.points.length = values.length;
        values.forEach((level, index) => {
            const x = (index + 1) * width / (values.length + 1);
            const y = (7 - level) * height / 6;
            const star = state.stars[index], label = state.labels[index], line = state.lines[index];
            star.classList.toggle('locked', locked);
            star.style.left = x + 'px'; star.style.top = y + 'px';
            if (label.textContent !== students[index]) label.textContent = students[index];
            label.style.left = x + 'px'; label.style.bottom = -bottomPadding + 'px';
            line.setAttribute('x1', x); line.setAttribute('x2', x);
            line.setAttribute('y1', y); line.setAttribute('y2', y + 20);
            state.points[index] = x + ',' + y;
        });
        area.appendChild(fragment); svg.insertBefore(lineFragment, state.polyline);
        state.polyline.setAttribute('points', state.points.join(' '));
        svg.setAttribute('width', width); svg.setAttribute('height', height);
        svg.style.width = width + 'px'; svg.style.height = height + 'px';
    }

    function buildAverageYAxis() {
        buildYAxis(averageYAxis);
    }

    function updateCloseDayButton() {
        const locked = isDayLocked(currentDate);
        btnCloseDay.textContent = locked ? '🔓 Открыть день' : '🔒 Закрыть день';
    }

    function getStudentLevel(index) {
        const dayData = moodData[currentDate];
        if (dayData && dayData[index] !== undefined) return dayData[index];
        return 4;
    }

    function updateConstellationLines(index, y) {
        const state = chartStates.get(plotArea);
        if (!state || !state.lines[index]) return;
        const x = (index + 1) * state.width / (students.length + 1);
        state.lines[index].setAttribute('y1', y);
        state.lines[index].setAttribute('y2', y + 20);
        state.points[index] = x + ',' + y;
        state.polyline.setAttribute('points', state.points.join(' '));
    }

    function bindStarEvents() {
        plotArea.addEventListener('mousedown', onStarMouseDown);
        plotArea.addEventListener('touchstart', onStarTouchStart, { passive: false });
        document.addEventListener('mousemove', onStarMouseMove);
        document.addEventListener('touchmove', onStarTouchMove, { passive: false });
        document.addEventListener('mouseup', onStarMouseUp);
        document.addEventListener('touchend', onStarTouchUp);
        document.addEventListener('touchcancel', endDrag);
        window.addEventListener('blur', endDrag);
        window.addEventListener('pagehide', endDrag);
        document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });
    }

    function getStarElement(target) {
        if (!target) return null;
        if (target.classList && target.classList.contains('student-star')) return target;
        if (target.parentElement && target.parentElement.classList.contains('student-star')) return target.parentElement;
        return null;
    }

    function highlightPair(index, active) {
        const star = getStarElementByIndex(index);
        const label = getLabelElementByIndex(index);
        if (star) star.classList.toggle('active', active);
        if (label) label.classList.toggle('active', active);
    }

    function getLabelElementByIndex(index) {
        return chartStates.get(plotArea)?.labels[index];
    }

    function onStarMouseDown(e) {
        if (isDayLocked(currentDate)) { alert('День закрыт!'); return; }
        const star = getStarElement(e.target);
        if (!star) return;
        const index = parseInt(star.dataset.index);
        startDrag(index);
        highlightPair(index, true);
        e.preventDefault();
    }

    function onStarTouchStart(e) {
        if (isDayLocked(currentDate)) { alert('День закрыт!'); return; }
        const touch = e.touches[0];
        const star = getStarElement(document.elementFromPoint(touch.clientX, touch.clientY));
        if (!star) return;
        const index = parseInt(star.dataset.index);
        startDrag(index);
        highlightPair(index, true);
        e.preventDefault();
    }

    function startDrag(index) {
        activeDragIndex = index;
        const star = getStarElementByIndex(index);
        if (star) star.classList.add('dragging');
    }

    function getStarElementByIndex(index) {
        return chartStates.get(plotArea)?.stars[index];
    }

    function onStarMouseMove(e) {
        if (activeDragIndex === -1) return;
        pendingDragY = e.clientY;
        if (!dragFrame) dragFrame = requestAnimationFrame(flushDrag);

    }

    function onStarTouchMove(e) {
        if (activeDragIndex === -1) return;
        pendingDragY = e.touches[0].clientY;
        if (!dragFrame) dragFrame = requestAnimationFrame(flushDrag);
        e.preventDefault();
    }

    function flushDrag() {
        dragFrame = 0;
        if (activeDragIndex !== -1 && pendingDragY !== null) {
            const rect = plotArea.getBoundingClientRect();
            moveStarTo(activeDragIndex, pendingDragY - rect.top);
            pendingDragY = null;
        }
    }

    function moveStarTo(index, y) {
        if (isDayLocked(currentDate)) return;
        const height = plotArea.clientHeight;
        if (!height) return;
        const clampedY = Math.max(0, Math.min(height, y));
        // Halfway positions keep the original preference for the lower level.
        const level = Math.max(1, Math.min(7, Math.ceil(6.5 - clampedY * 6 / height)));
        if (moodData[currentDate]?.[index] === level) return;
        if (!moodData[currentDate]) moodData[currentDate] = {};
        moodData[currentDate][index] = level;
        moodDirty = true;
        averageCache = null;
        const snappedY = (7 - level) * height / 6;
        const star = getStarElementByIndex(index);
        if (star) star.style.top = snappedY + 'px';
        updateConstellationLines(index, snappedY);
    }

    function onStarMouseUp(e) {
        if (activeDragIndex !== -1) highlightPair(activeDragIndex, false);
        endDrag();
    }

    function onStarTouchUp(e) {
        if (activeDragIndex !== -1) highlightPair(activeDragIndex, false);
        endDrag();
    }

    function endDrag() {
        if (dragFrame) cancelAnimationFrame(dragFrame);
        flushDrag();
        if (activeDragIndex !== -1) {
            highlightPair(activeDragIndex, false);
            const star = getStarElementByIndex(activeDragIndex);
            if (star) star.classList.remove('dragging');
            activeDragIndex = -1;
        }
        if (moodDirty) saveMoodDataToStorage();
    }

    function updateDateDisplay() {
        datePicker.value = currentDate;
        buildChart();
    }

    function onDateChange(e) {
        currentDate = e.target.value;
        if (!currentDate) currentDate = new Date().toISOString().slice(0, 10);
        buildChart();
    }

    function openStudentModal() {
        studentListText.value = students.join('\n');
        modalStudents.classList.remove('hidden');
    }

    function closeStudentModal() { modalStudents.classList.add('hidden'); }

    function saveStudentList() {
        const lines = studentListText.value.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        students = lines.slice(0, 50);
        saveStudentsToStorage();
        buildChart();
        closeStudentModal();
    }

    function showAverageModal() {
        modalAverage.classList.remove('hidden');
        setTimeout(() => buildAverageChart(), 0);
    }

    function closeAverageModal() { modalAverage.classList.add('hidden'); }

    function closeDay() {
        if (isDayLocked(currentDate)) {
            delete lockedDays[currentDate];
            saveLockedDaysToStorage();
            buildChart();
            alert('День открыт!');
        } else {
            lockedDays[currentDate] = true;
            saveLockedDaysToStorage();
            buildChart();
            alert('День закрыт!');
        }
    }

    function openResetModal() { modalReset.classList.remove('hidden'); }
    function closeResetModal() { modalReset.classList.add('hidden'); }

    function resetDay() {
        if (confirm(`Сбросить данные за ${currentDate}?`)) {
            delete moodData[currentDate];
            delete lockedDays[currentDate];
            saveMoodDataToStorage();
            saveLockedDaysToStorage();
            buildChart();
            closeResetModal();
        }
    }

    function resetAll() {
        if (confirm('Сбросить все данные трекера? Это действие необратимо!')) {
            moodData = {};
            lockedDays = {};
            saveMoodDataToStorage();
            saveLockedDaysToStorage();
            buildChart();
            closeResetModal();
        }
    }

    function openDownloadModal() { modalDownload.classList.remove('hidden'); }
    function closeDownloadModal() { modalDownload.classList.add('hidden'); }
    function openDownloadAverageModal() { modalDownloadAverage.classList.remove('hidden'); }
    function closeDownloadAverageModal() { modalDownloadAverage.classList.add('hidden'); }

    function captureChart(container) {
        return html2canvas(container, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
    }

    async function exportCurrentChart(format) {
        try {
            await prepareExport(format);
            const canvas = await captureChart(chartContainer);
            const filename = `mood-tracker-${currentDate}`;
            await saveCanvas(canvas, format, filename);
        } catch (err) { alert('Ошибка при сохранении: ' + err); }
    }

    async function exportAverageChart(format) {
        const wasHidden = modalAverage.classList.contains('hidden');
        try {
            await prepareExport(format);
            if (wasHidden) {
                modalAverage.classList.remove('hidden');
                await new Promise(resolve => setTimeout(resolve, 0));
                buildAverageChart();
            }
            const canvas = await captureChart(averageChartContainer);
            const filename = `средние-результаты-${currentDate}`;
            await saveCanvas(canvas, format, filename);
            if (wasHidden) modalAverage.classList.add('hidden');
        } catch (err) { alert('Ошибка при сохранении средних: ' + err); }
        finally { if (wasHidden) modalAverage.classList.add('hidden'); }
    }

    function toggleSettings() {
        const password = prompt('Введите пароль для доступа к настройкам:');
        if (password === '0000') {
            settingsContent.classList.toggle('open');
        } else {
            alert('Неверный пароль!');
        }
    }

    function closeSettingsOnOutsideClick(e) {
        if (!settingsDropdown.contains(e.target)) settingsContent.classList.remove('open');
    }

    function bindEvents() {
        datePicker.addEventListener('change', onDateChange);
        btnSettings.addEventListener('click', toggleSettings);
        document.addEventListener('click', closeSettingsOnOutsideClick);

        btnStudents.addEventListener('click', () => { settingsContent.classList.remove('open'); openStudentModal(); });
        btnCancelStudents.addEventListener('click', closeStudentModal);
        btnSaveStudents.addEventListener('click', saveStudentList);

        btnDownload.addEventListener('click', () => { settingsContent.classList.remove('open'); openDownloadModal(); });
        btnDownloadPNG.addEventListener('click', () => { closeDownloadModal(); exportCurrentChart('png'); });
        btnDownloadJPG.addEventListener('click', () => { closeDownloadModal(); exportCurrentChart('jpg'); });
        btnDownloadPDF.addEventListener('click', () => { closeDownloadModal(); exportCurrentChart('pdf'); });
        btnCancelDownload.addEventListener('click', closeDownloadModal);

        btnDownloadAverage.addEventListener('click', () => { settingsContent.classList.remove('open'); openDownloadAverageModal(); });
        btnDownloadAveragePNG.addEventListener('click', () => { closeDownloadAverageModal(); exportAverageChart('png'); });
        btnDownloadAverageJPG.addEventListener('click', () => { closeDownloadAverageModal(); exportAverageChart('jpg'); });
        btnDownloadAveragePDF.addEventListener('click', () => { closeDownloadAverageModal(); exportAverageChart('pdf'); });
        btnCancelDownloadAverage.addEventListener('click', closeDownloadAverageModal);

        btnAverage.addEventListener('click', () => { settingsContent.classList.remove('open'); showAverageModal(); });
        btnCloseAverage.addEventListener('click', closeAverageModal);

        btnCloseDay.addEventListener('click', () => { settingsContent.classList.remove('open'); closeDay(); });

        btnReset.addEventListener('click', () => { settingsContent.classList.remove('open'); openResetModal(); });
        btnResetDay.addEventListener('click', resetDay);
        btnResetAll.addEventListener('click', resetAll);
        btnCancelReset.addEventListener('click', closeResetModal);

        bindStarEvents();

        let resizeFrame = 0;
        const scheduleLayout = () => {
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = 0;
                buildChart();
                if (!modalAverage.classList.contains('hidden')) buildAverageChart();
            });
        };
        window.addEventListener('resize', scheduleLayout);
        document.addEventListener('app:tabchange', scheduleLayout);
    }

    init();
})();

/* ==================== МЕМОСКОП ==================== */
(function() {
    // В статическом сайте браузер не может прочитать содержимое папки сам.
    // Добавляйте сюда новые файлы из папки img, когда они появятся.
    const memeImages = [
        'img/meme_1.jpg',
        'img/meme_2.jpg',
        'img/meme_3.jpg',
        'img/meme_4.jpg',
        'img/meme_5.jpg',
        'img/meme_6.jpg',
        'img/meme_7.jpg'
    ];
    const zodiacSigns = [
        { name: 'Овен', symbol: '♈', analog: 'Красный сверхгигант Бетельгейзе' },
        { name: 'Телец', symbol: '♉', analog: 'Звёздное скопление Плеяды' },
        { name: 'Близнецы', symbol: '♊', analog: 'Двойная звезда Альбирео' },
        { name: 'Рак', symbol: '♋', analog: 'Туманность Улитка' },
        { name: 'Лев', symbol: '♌', analog: 'Голубой сверхгигант Ригель' },
        { name: 'Дева', symbol: '♍', analog: 'Галактика Сомбреро' },
        { name: 'Весы', symbol: '♎', analog: 'Равновесная двойная система' },
        { name: 'Скорпион', symbol: '♏', analog: 'Нейтронная звезда-пульсар' },
        { name: 'Стрелец', symbol: '♐', analog: 'Центр Галактики' },
        { name: 'Козерог', symbol: '♑', analog: 'Карликовая планета Плутон' },
        { name: 'Водолей', symbol: '♒', analog: 'Ледяной гигант Уран' },
        { name: 'Рыбы', symbol: '♓', analog: 'Туманность Кольцо' }
    ];

    // База шуток (полная версия из предыдущих ответов, здесь краткая)
    const jokeBank = {
        'Овен': ['Овен, сегодня ты быстрее света!', 'Овен, звёзды советуют не спорить с тьютором.'],
        'Телец': ['Телец, твоя стабильность крепче Юпитера.', 'Телец, не ешь всё в столовой!'],
        'Близнецы': ['Близнецы, у тебя сто идей в минуту!', 'Близнецы, твой смех заразителен.'],
        'Рак': ['Рак, ты сегодня чувствителен, как детектор волн.', 'Рак, не прячься в раковину!'],
        'Лев': ['Лев, ты сияешь ярче Ригеля.', 'Лев, веди отряд как капитан звездолёта.'],
        'Дева': ['Дева, твоя логика острее лазера.', 'Дева, помоги друзьям с конспектом.'],
        'Весы': ['Весы, ты прирождённый миротворец.', 'Весы, найди компромисс даже между кошкой и собакой.'],
        'Скорпион': ['Скорпион, твоя проницательность глубже чёрной дыры.', 'Скорпион, не держи обиды.'],
        'Стрелец': ['Стрелец, твой оптимизм выше МКС.', 'Стрелец, заряди всех позитивом!'],
        'Козерог': ['Козерог, твоя дисциплина крепче нейтронной звезды.', 'Козерог, составь план на неделю.'],
        'Водолей': ['Водолей, твоя фантазия безгранична, как Вселенная.', 'Водолей, изобрети что-нибудь!'],
        'Рыбы': ['Рыбы, твоя мечтательность красива, как туманность.', 'Рыбы, не уплывай далеко!']
    };

    function generateJoke(signName, dateStr) {
        const jokes = jokeBank[signName] || ['Сегодня отличный день!'];
        const str = dateStr + signName;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const index = Math.abs(hash) % jokes.length;
        return jokes[index];
    }

    let horoscopeOverride = {};
    let memeAssignments = {};
    let currentHoroscopeDate = new Date().toISOString().slice(0, 10);
    let currentSignIndex = 0;
    let autoAdvanceTimer = null;
    const AUTO_ADVANCE_MS = 15000;

    const horoscopeDatePicker = document.getElementById('horoscopeDatePicker');
    const horoscopeFullscreen = document.getElementById('horoscopeFullscreen');
    const btnHoroscopeSettings = document.getElementById('btnHoroscopeSettings');
    const modalHoroscopeEdit = document.getElementById('modalHoroscopeEdit');
    const editHoroscopeDateLabel = document.getElementById('editHoroscopeDateLabel');
    const horoscopeEditList = document.getElementById('horoscopeEditList');
    const btnCancelHoroscopeEdit = document.getElementById('btnCancelHoroscopeEdit');
    const btnSaveHoroscopeEdit = document.getElementById('btnSaveHoroscopeEdit');
    const modalHoroscopeExport = document.getElementById('modalHoroscopeExport');
    const horoscopeExportCheckboxes = document.getElementById('horoscopeExportCheckboxes');
    const btnHoroscopeExportPNG = document.getElementById('btnHoroscopeExportPNG');
    const btnHoroscopeExportJPG = document.getElementById('btnHoroscopeExportJPG');
    const btnHoroscopeExportPDF = document.getElementById('btnHoroscopeExportPDF');
    const btnCancelHoroscopeExport = document.getElementById('btnCancelHoroscopeExport');
    const modalHoroscopeReset = document.getElementById('modalHoroscopeReset');
    const btnHoroscopeResetDay = document.getElementById('btnHoroscopeResetDay');
    const btnHoroscopeResetAll = document.getElementById('btnHoroscopeResetAll');
    const btnCancelHoroscopeReset = document.getElementById('btnCancelHoroscopeReset');

    function loadHoroscopeOverride() {
        const stored = localStorage.getItem('horoscopeOverride');
        if (stored) {
            try { horoscopeOverride = JSON.parse(stored); } catch (e) { horoscopeOverride = {}; }
        }
    }

    function saveHoroscopeOverride() {
        localStorage.setItem('horoscopeOverride', JSON.stringify(horoscopeOverride));
    }

    function loadMemeAssignments() {
        const stored = localStorage.getItem('horoscopeMemeAssignments');
        if (stored) {
            try { memeAssignments = JSON.parse(stored); } catch (e) { memeAssignments = {}; }
        }
    }

    function saveMemeAssignments() {
        localStorage.setItem('horoscopeMemeAssignments', JSON.stringify(memeAssignments));
    }

    function getPreviousDate(dateKey) {
        const date = new Date(`${dateKey}T00:00:00`);
        date.setDate(date.getDate() - 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getNextDate(dateKey) {
        const date = new Date(`${dateKey}T00:00:00`);
        date.setDate(date.getDate() + 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function shuffle(items) {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
        }
        return result;
    }

    function getMemesForDate(dateKey) {
        if (Array.isArray(memeAssignments[dateKey])) return memeAssignments[dateKey];

        const adjacentDayMemes = new Set([
            ...(memeAssignments[getPreviousDate(dateKey)] || []),
            ...(memeAssignments[getNextDate(dateKey)] || [])
        ]);
        const availableMemes = memeImages.filter(image => !adjacentDayMemes.has(image));
        const assignments = shuffle(availableMemes).slice(0, zodiacSigns.length);

        // null означает, что файла для знака не хватило: один мем не повторяется
        // ни в этот день, ни на следующий.
        while (assignments.length < zodiacSigns.length) assignments.push(null);
        memeAssignments[dateKey] = assignments;
        saveMemeAssignments();
        return assignments;
    }

    function displayCurrentSign() {
        const dateKey = currentHoroscopeDate;
        const sign = zodiacSigns[currentSignIndex];
        const override = horoscopeOverride[dateKey]?.[currentSignIndex] || {};
        const text = override.text || generateJoke(sign.name, dateKey);
        const analog = override.analog || sign.analog;
        const memeImage = getMemesForDate(dateKey)[currentSignIndex];

        let contentDiv = horoscopeFullscreen.firstElementChild;

        // Создаём космический фон (уже есть в CSS, просто добавляем контент)
        if (!contentDiv) {
            contentDiv = document.createElement('div');
            contentDiv.className = 'zodiac-content';
            contentDiv.innerHTML = `
                <div class="zodiac-details">
                    <div class="zodiac-symbol">${sign.symbol}</div>
                    <div class="zodiac-name">${sign.name}</div>
                    <div class="zodiac-analog">${escapeHTML(analog)}</div>
                    <div class="zodiac-text">${escapeHTML(text)}</div>
                </div>
                <figure class="meme-of-day">
                    <img class="meme-image" alt="Мем дня">
                    <figcaption>Мем дня</figcaption>
                </figure>
                    <div class="switch-hint">Нажмите для следующего знака</div>
                `;
            horoscopeFullscreen.appendChild(contentDiv);
        }
        contentDiv.querySelector('.zodiac-symbol').textContent = sign.symbol;
        contentDiv.querySelector('.zodiac-name').textContent = sign.name;
        contentDiv.querySelector('.zodiac-analog').textContent = analog;
        contentDiv.querySelector('.zodiac-text').textContent = text;
        const meme = contentDiv.querySelector('.meme-of-day');
        const memeElement = contentDiv.querySelector('.meme-image');
        meme.classList.toggle('meme-unavailable', !memeImage);
        memeElement.hidden = !memeImage;
        memeElement.src = memeImage || '';
        memeElement.alt = memeImage ? `Мем дня для знака ${sign.name}` : '';
        meme.querySelector('figcaption').textContent = memeImage
            ? 'Мем дня'
            : 'Недостаточно новых мемов';

        clearInterval(autoAdvanceTimer);
        autoAdvanceTimer = setInterval(() => advanceSign(), AUTO_ADVANCE_MS);
    }

    function advanceSign() {
        currentSignIndex = (currentSignIndex + 1) % zodiacSigns.length;
        displayCurrentSign();
    }

    function initHoroscope() {
        loadHoroscopeOverride();
        loadMemeAssignments();
        horoscopeDatePicker.value = currentHoroscopeDate;
        currentSignIndex = 0;
        displayCurrentSign();
        bindHoroscopeEvents();
        addExtraButtonsToEditModal();
    }

    function onFullscreenClick() {
        advanceSign();
    }

    function openHoroscopeSettings() {
        const password = prompt('Введите пароль для доступа к настройкам мемоскопа:');
        if (password === '0000') {
            openHoroscopeEdit();
        } else {
            alert('Неверный пароль!');
        }
    }

    function openHoroscopeEdit() {
        const dateKey = currentHoroscopeDate;
        editHoroscopeDateLabel.textContent = dateKey;
        horoscopeEditList.innerHTML = '';
        zodiacSigns.forEach((sign, idx) => {
            const override = horoscopeOverride[dateKey]?.[idx] || {};
            const currentText = override.text || generateJoke(sign.name, dateKey);
            const currentAnalog = override.analog || sign.analog;
            const item = document.createElement('div');
            item.className = 'horoscope-edit-item';
            item.innerHTML = `
                        <strong>${sign.symbol} ${sign.name}</strong>
                        <label>Текст: <textarea data-field="text" data-idx="${idx}" rows="3">${escapeHTML(currentText)}</textarea></label>
                        <label>Аналог: <input type="text" data-field="analog" data-idx="${idx}" value="${escapeHTML(currentAnalog)}"></label>
                    `;
            horoscopeEditList.appendChild(item);
        });
        modalHoroscopeEdit.classList.remove('hidden');
    }

    function closeHoroscopeEdit() {
        modalHoroscopeEdit.classList.add('hidden');
    }

    function saveHoroscopeEdit() {
        const dateKey = currentHoroscopeDate;
        if (!horoscopeOverride[dateKey]) horoscopeOverride[dateKey] = {};
        document.querySelectorAll('#horoscopeEditList .horoscope-edit-item').forEach((item, idx) => {
            const text = item.querySelector('[data-field="text"]').value;
            const analog = item.querySelector('[data-field="analog"]').value;
            horoscopeOverride[dateKey][idx] = { text, analog };
        });
        saveHoroscopeOverride();
        closeHoroscopeEdit();
        displayCurrentSign();
    }

    function openHoroscopeExport() {
        horoscopeExportCheckboxes.innerHTML = '';
        zodiacSigns.forEach((sign, idx) => {
            const label = document.createElement('label');
            label.style.display = 'block';
            label.innerHTML = `<input type="checkbox" class="horoscope-export-check" value="${idx}" checked> ${sign.symbol} ${sign.name}`;
            horoscopeExportCheckboxes.appendChild(label);
        });
        modalHoroscopeExport.classList.remove('hidden');
    }

    function closeHoroscopeExport() {
        modalHoroscopeExport.classList.add('hidden');
    }

    async function exportHoroscope(format) {
        const selected = Array.from(document.querySelectorAll('.horoscope-export-check:checked')).map(cb => parseInt(cb.value));
        if (selected.length === 0) { alert('Выберите хотя бы один знак!'); return; }
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:absolute; left:-9999px; top:0; width:1200px; background:#0a0a1a; display:grid; grid-template-columns: repeat(4,1fr); gap:15px; padding:15px;';
        const dateKey = currentHoroscopeDate;
        selected.forEach(idx => {
            const sign = zodiacSigns[idx];
            const override = horoscopeOverride[dateKey]?.[idx] || {};
            const text = override.text || generateJoke(sign.name, dateKey);
            const analog = override.analog || sign.analog;
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(20,20,60,0.8); border:2px solid #ffcc00; border-radius:15px; padding:10px; text-align:center; color:#eee;';
            card.innerHTML = `
                        <div style="font-size:2.5rem;">${sign.symbol}</div>
                        <div style="font-weight:700; font-size:1.2rem; color:#ffcc00;">${sign.name}</div>
                        <div style="font-size:0.8rem; color:#ccc;">${escapeHTML(analog)}</div>
                        <div style="font-size:0.9rem; margin:5px 0;">${escapeHTML(text)}</div>
                    `;
            tempDiv.appendChild(card);
        });
        document.body.appendChild(tempDiv);
        try {
            await prepareExport(format);
            const canvas = await html2canvas(tempDiv, { backgroundColor: '#0a0a1a', scale: 2, useCORS: true, logging: false });
            const filename = `horoscope-${dateKey}`;
            await saveCanvas(canvas, format, filename, '#0a0a1a');
        } catch (err) {
            alert('Ошибка при экспорте: ' + err);
        } finally {
            tempDiv.remove();
        }
        closeHoroscopeExport();
    }

    function resetHoroscopeDay() {
        if (confirm(`Сбросить переопределения мемоскопа за ${currentHoroscopeDate}?`)) {
            delete horoscopeOverride[currentHoroscopeDate];
            delete memeAssignments[currentHoroscopeDate];
            saveHoroscopeOverride();
            saveMemeAssignments();
            displayCurrentSign();
            closeHoroscopeReset();
        }
    }

    function resetHoroscopeAll() {
        if (confirm('Сбросить все данные мемоскопа (переопределения)? Это действие необратимо!')) {
            horoscopeOverride = {};
            memeAssignments = {};
            saveHoroscopeOverride();
            saveMemeAssignments();
            displayCurrentSign();
            closeHoroscopeReset();
        }
    }

    function openHoroscopeReset() {
        modalHoroscopeReset.classList.remove('hidden');
    }

    function closeHoroscopeReset() {
        modalHoroscopeReset.classList.add('hidden');
    }

    function bindHoroscopeEvents() {
        horoscopeDatePicker.addEventListener('change', (e) => {
            currentHoroscopeDate = e.target.value || new Date().toISOString().slice(0, 10);
            currentSignIndex = 0;
            displayCurrentSign();
        });
        btnHoroscopeSettings.addEventListener('click', openHoroscopeSettings);
        horoscopeFullscreen.addEventListener('click', onFullscreenClick);
        btnCancelHoroscopeEdit.addEventListener('click', closeHoroscopeEdit);
        btnSaveHoroscopeEdit.addEventListener('click', saveHoroscopeEdit);
        btnHoroscopeExportPNG.addEventListener('click', () => exportHoroscope('png'));
        btnHoroscopeExportJPG.addEventListener('click', () => exportHoroscope('jpg'));
        btnHoroscopeExportPDF.addEventListener('click', () => exportHoroscope('pdf'));
        btnCancelHoroscopeExport.addEventListener('click', closeHoroscopeExport);
        btnHoroscopeResetDay.addEventListener('click', resetHoroscopeDay);
        btnHoroscopeResetAll.addEventListener('click', resetHoroscopeAll);
        btnCancelHoroscopeReset.addEventListener('click', closeHoroscopeReset);
    }

    function addExtraButtonsToEditModal() {
        const actionsDiv = document.querySelector('#modalHoroscopeEdit .actions');
        if (actionsDiv) {
            if (!actionsDiv.querySelector('.export-from-edit')) {
                const exportBtn = document.createElement('button');
                exportBtn.textContent = '💾 Экспорт';
                exportBtn.className = 'export-from-edit';
                exportBtn.addEventListener('click', () => {
                    closeHoroscopeEdit();
                    openHoroscopeExport();
                });
                actionsDiv.insertBefore(exportBtn, btnCancelHoroscopeEdit);
            }
            if (!actionsDiv.querySelector('.reset-from-edit')) {
                const resetBtn = document.createElement('button');
                resetBtn.textContent = '🔄 Сброс';
                resetBtn.className = 'reset-from-edit';
                resetBtn.addEventListener('click', () => {
                    closeHoroscopeEdit();
                    openHoroscopeReset();
                });
                actionsDiv.insertBefore(resetBtn, btnCancelHoroscopeEdit);
            }
        }
    }

    initHoroscope();
})();

/* ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ==================== */
(function() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            document.dispatchEvent(new Event('app:tabchange'));
        });
    });
})();
