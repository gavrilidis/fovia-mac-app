# FaceFlow — Установка / Installation

> Канонический источник инструкции для конечного пользователя —
> документ **«How to open FaceFlow.pdf»**, который лежит прямо внутри
> установочного образа `FaceFlow_*.dmg`. Этот файл в репозитории —
> резервная текстовая копия для разработчиков и поддержки.

---

## Русский

### 1. Установка

1. Откройте образ `FaceFlow_*.dmg`.
2. В появившемся окне перетащите иконку **FaceFlow** в папку
   **Applications** (значок справа).
3. Закройте окно DMG и извлеките образ (правой кнопкой → «Извлечь»).

### 2. Первый запуск

macOS блокирует приложения от «неизвестных разработчиков» по
умолчанию. Достаточно выполнить **один** из трёх способов ниже — после
этого FaceFlow будет запускаться обычным двойным кликом.

**Способ 1. Правый клик → «Открыть» (рекомендуется).**

1. Откройте папку **Программы** в Finder.
2. Правый клик (или Control-клик) по **FaceFlow**.
3. Выберите **Открыть**, затем в диалоге снова нажмите **Открыть**.

**Способ 2. Системные настройки → «Конфиденциальность и безопасность».**

1. Попробуйте запустить FaceFlow обычным способом — macOS заблокирует
   запуск (это нужно, чтобы появилась кнопка).
2. Откройте **Системные настройки → Конфиденциальность и безопасность**.
3. Прокрутите вниз и нажмите **«Открыть всё равно»** напротив FaceFlow.

**Способ 3. Терминал (для опытных пользователей).**

```bash
xattr -dr com.apple.quarantine /Applications/FaceFlow.app
```

### 3. Активация

1. При первом запуске введите ключ активации из письма о покупке.
2. Ключ привязывается к этому Mac и хранится локально.

### 4. Сканирование фотографий

1. Перетащите папку с фотографиями в окно FaceFlow или нажмите
   **«Выбрать папку»**.
2. Поддерживаются форматы: JPG, PNG, HEIC, RAW (RW2, RAF, ARW, NEF,
   CR2, DNG и другие).
3. Распознавание лиц выполняется в облаке — требуется соединение с
   интернетом.

### 5. Поддержка

По вопросам установки и работы: **support@faceflow.app**

---

## English

### 1. Install

1. Open `FaceFlow_*.dmg`.
2. In the window that appears, drag the **FaceFlow** icon onto the
   **Applications** folder (the icon on the right).
3. Close the DMG window and eject the image.

### 2. First launch

macOS blocks apps from "unidentified developers" by default. Choose
**any one** of the three methods below — after that FaceFlow will open
normally on double-click.

**Method 1. Right-click → Open (recommended).**

1. Open the **Applications** folder in Finder.
2. Right-click (or Control-click) **FaceFlow**.
3. Choose **Open**, then click **Open** in the confirmation dialog.

**Method 2. System Settings → Privacy & Security.**

1. Try to launch FaceFlow normally — macOS will block it (this is
   required to reveal the button).
2. Open **System Settings → Privacy & Security**.
3. Scroll down and click **Open Anyway** next to FaceFlow.

**Method 3. Terminal (power users).**

```bash
xattr -dr com.apple.quarantine /Applications/FaceFlow.app
```

### 3. Activation

1. On first launch, enter the activation key from your purchase email.
2. The key is bound to this Mac and stored locally.

### 4. Scanning photos

1. Drag a folder of photos into FaceFlow, or click **Choose folder**.
2. Supported formats: JPG, PNG, HEIC, and RAW (RW2, RAF, ARW, NEF,
   CR2, DNG, …).
3. Face recognition runs in the cloud; an internet connection is
   required.

### 5. Support

For installation help: **support@faceflow.app**
