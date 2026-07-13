(function() {

  'use strict'; // Enforce stricter parsing and error handling

  // --- Prevent multiple reader instances ---
  if (window.rsvpInstance) {
    console.log("Removing existing RSVP instance.");
    window.rsvpInstance.remove();
    window.rsvpInstance = null;
  }

  // --- RSVPReader Class Definition ---
  class RSVPReader {
    constructor() {
      this.isPlaying = false;
      this.currentWordIndex = 0;
      this.words = [];
      this.intervalId = null;
      this.mouseDown = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.MIN_TEXT_LENGTH = 150;
      this.MIN_WORD_COUNT = 25;

      // --- Core Reading Loop Function ---
      // Defined as an arrow function to preserve 'this' context when used with setTimeout.
      this.tick = () => {
          if (!this.isPlaying) return; // Exit if paused or stopped

          if (this.currentWordIndex < this.words.length) {
              const currentWord = this.words[this.currentWordIndex];

              // --- Display current word and update index ---
              this.setWord(currentWord);
              this.currentWordIndex++; // Increment *before* calculating next interval based on the word *just shown*
              this.updateProgressDisplay(); // Update progress bar and time

              // --- Calculate interval for next pause ---
              const baseInterval = 60000 / this.getWPM(); // Normal interval based on WPM
              const nextInterval = baseInterval * this.getWordMultiplier(currentWord);

              // --- Schedule Next Word ---
              clearTimeout(this.intervalId);
              this.intervalId = setTimeout(this.tick, nextInterval);

          } else {
              // --- End of Text ---
              this.stop();
              this.setStatus("Finished!");
              this.progressBar.style.width = '100%';  // Ensure bar is full on finish
              this.timeRemainingDisplay.textContent = this.formatTime(0); // Show 0 time at end
          }
      };


      // --- WPM Change Handler ---
       this.handleWpmChange = () => {
           try { localStorage.setItem('rsvp_reader_wpm', String(this.getWPM())); } catch (e) { /* localStorage may be blocked */ }
           this.updateProgressDisplay(); // Update time estimate immediately
           if (!this.isPlaying) return;
           clearTimeout(this.intervalId);
           const newWpm = this.getWPM();
           const newBaseInterval = 60000 / newWpm;
           this.intervalId = setTimeout(this.tick, newBaseInterval);
       };

      this.createStyles();
      this.createUI();
      this.attachEventListeners();
      this.setStatus("RSVP Ready");
      document.body.appendChild(this.rootDiv);
      // Set initial progress state after UI exists
       this.updateProgressDisplay();
    }

    // --- Text Selection ---
    getSelectedText() {
        let text = "";
        const selection = window.getSelection();
        if (selection) { text = selection.toString(); }
        return (text && text.trim().length > 10) ? text.trim().replace(/(\r\n|\n|\r)/gm, " ") : "";
    }

    // --- Automatic Main Content Detection ---
    findMainContentElement() {
        console.log("Attempting to find main content...");
        const candidates = []; let bestCandidate = null; let maxScore = -1;
        document.querySelectorAll('main, article').forEach(el => { if (this.isPotentialContent(el)) candidates.push(el); });
        const commonSelectors = [
            '#content', '#main-content', '#main', '#entry', '#article', '.content', '.main-content', '.main', '.entry', '.entry-content',
            '.post', '.post-content', '.post-body', '.article', '.article-content', '.article-body', '.story', '.story-content' ];
        document.querySelectorAll(commonSelectors.join(', ')).forEach(el => {
             if (this.isPotentialContent(el) && !candidates.some(c => c.contains(el))) { candidates.push(el); }
        });
        // console.log(`Found ${candidates.length} initial candidates.`); // Optional debug
        candidates.forEach(el => {
            const score = this.scoreElement(el);
            if (score > maxScore) { maxScore = score; bestCandidate = el; }
        });
        if (bestCandidate && maxScore > 0) {
             const textContent = this.extractText(bestCandidate); const wordCount = textContent.split(/\s+/).length;
             if (textContent.length >= this.MIN_TEXT_LENGTH && wordCount >= this.MIN_WORD_COUNT) {
                 console.log(`Selected best candidate: ${bestCandidate.tagName}#${bestCandidate.id}.${(bestCandidate.getAttribute('class') || '').split(' ').join('.')} with score ${maxScore.toFixed(2)}`);
                 return bestCandidate;
             } else { console.log(`Best candidate rejected (score: ${maxScore.toFixed(2)}, length: ${textContent.length}, words: ${wordCount}).`); }
        }
        console.log("Could not determine main content element reliably.");
        return null;
    }

    isPotentialContent(el) {
        if (!el || typeof el.matches !== 'function') return false;
        if (el.nodeType !== Node.ELEMENT_NODE || el.matches('script, style, noscript, iframe, header, footer, nav, aside, form, button, select, textarea') || el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') { return false; }
        const role = el.getAttribute('role');
        if (role && /^(navigation|search|banner|complementary|contentinfo|form|menu|menubar|tablist|dialog|alert|log|status|timer)/i.test(role)) { return false; }
        if (el.matches('header *, footer *, nav *, aside *')) { if (!el.matches('main, article, #content, #main, .content, .entry-content, .post-body')) { return false; } }
        return true;
    }

    scoreElement(el) {
        if (!el) return 0;
        const textContent = this.extractText(el); const textLength = textContent.length;
        if (textLength < this.MIN_TEXT_LENGTH) return 0;
        const paragraphCount = el.querySelectorAll('p').length; const linkCount = el.querySelectorAll('a').length;
        const imgCount = el.querySelectorAll('img').length; const headingCount = el.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
        const linkDensity = linkCount / (textLength + 1); let score = Math.log10(textLength + 1) * (paragraphCount + 1); score += headingCount * 2;
        if (linkDensity > 0.1) score *= 0.5; if (linkDensity > 0.3) score *= 0.3;
        const imgDensity = imgCount / (textLength / 100 + 1); if (imgDensity > 5) score *= 0.6;
        if (el.matches('main')) score *= 2.0; else if (el.matches('article')) score *= 1.5;
        if (/(comment|meta|share|related|sidebar|ad-slot|nav|menu|footer|header|masthead|widget|utility|social)/i.test(el.getAttribute('class') || '')) { score *= 0.3; }
        const listItems = el.querySelectorAll('li'); if (listItems.length > 5) { const listLinks = el.querySelectorAll('li a').length; if (listLinks / (listItems.length + 1) > 0.8) { score *= 0.2; } }
        return Math.max(0, score);
    }

    extractText(el) {
         let text = ''; const clone = el.cloneNode(true);
         clone.querySelectorAll('script, style, noscript, iframe, button, select, textarea, nav, aside, footer, header, [aria-hidden="true"]').forEach(badEl => badEl.remove());
         text = clone.textContent || ""; return text.replace(/\s+/g, ' ').trim();
     }

    // --- UI Creation: Styles ---
    createStyles() {
        this.rsvpStyles = `
        #rsvp_root {
          position: fixed; z-index: 2147483647; width: 400px; left: 50%; top: 50px;
          transform: translateX(-50%); padding: 15px; background-color: rgba(255, 255, 255, 0.95);
          border: 1px solid #ccc; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); border-radius: 5px;
          color: #333; font-family: "Source Code Pro", "Courier New", Courier, monospace;
          line-height: 1.4; user-select: none;
        }
        #rsvp_drag_handle { height: 20px; cursor: move; position: relative; margin-bottom: 10px; border-bottom: 1px solid #eee; }
        #rsvp_drag_handle::before { content: '☰'; position: absolute; left: 50%; transform: translateX(-50%); color: #aaa; font-size: 14px; top: -2px; }
        #rsvp-display-area { position: relative; height: 70px; margin-bottom: 10px; overflow: hidden; }
        #rsvp_line_top, #rsvp_line_bottom { position: absolute; left: 0; right: 0; height: 1px; background-color: #ccc; }
        #rsvp_line_top::before, #rsvp_line_bottom::before { content: ''; position: absolute; left: 50%; transform: translateX(-50%); width: 1px; height: 8px; background-color: red; }
        #rsvp_line_top { top: 15px; } #rsvp_line_top::before { top: -8px; } #rsvp_line_bottom { bottom: 15px; } #rsvp_line_bottom::before { bottom: -8px; }
        #rsvp-flex-container { display: flex; justify-content: center; align-items: center; height: 100%; text-align: center; font-size: 30px; font-weight: bold; white-space: pre; }
        #rsvp_word_wrapper { flex: 0 0 auto; padding: 0 10px; }
        #rsvp_word_pivot { color: red; }
        #rsvp_progress_container { width: 100%; height: 8px; background-color: #e0e0e0; border-radius: 4px; overflow: hidden; margin-top: 5px; }
        #rsvp_progress_bar { height: 100%; width: 0%; background-color: #4CAF50; border-radius: 4px; transition: width 0.1s linear; }
        #rsvp_time_remaining { text-align: center; font-size: 0.75em; color: #666; margin-top: 4px; margin-bottom: 10px; height: 1em; }
        #rsvp_controls { padding-top: 10px; text-align: center; border-top: 1px solid #eee; }
        #rsvp_controls > * { margin: 0 5px; cursor: pointer; vertical-align: middle; }
        #rsvp_controls button { padding: 5px 12px; border: 1px solid #ccc; background-color: #f0f0f0; border-radius: 3px; }
        #rsvp_controls button:hover { background-color: #e0e0e0; border-color: #bbb; }
        #rsvp_controls select { padding: 0px 25px; border-radius: 3px; border: 1px solid #ccc; }
      `;
        this.styleSheet = document.createElement("style");
        this.styleSheet.textContent = this.rsvpStyles;
        document.head.appendChild(this.styleSheet);
    }

    // --- UI Creation: Elements ---
    createUI() {
        this.rootDiv = this.addUiElement("div", "rsvp_root");
        this.dragHandle = this.addUiElement("div", "rsvp_drag_handle", this.rootDiv);
        this.displayArea = this.addUiElement("div", "rsvp-display-area", this.rootDiv);
        this.lineTop = this.addUiElement("div", "rsvp_line_top", this.displayArea);
        this.lineBottom = this.addUiElement("div", "rsvp_line_bottom", this.displayArea);
        this.wordFlexContainer = this.addUiElement("div", "rsvp-flex-container", this.displayArea);
        this.wordWrapper = this.addUiElement("div", "rsvp_word_wrapper", this.wordFlexContainer);
        this.former = this.addUiElement("span", "rsvp_word_former", this.wordWrapper);
        this.pivot = this.addUiElement("span", "rsvp_word_pivot", this.wordWrapper);
        this.latter = this.addUiElement("span", "rsvp_word_latter", this.wordWrapper);
        this.progressContainer = this.addUiElement("div", "rsvp_progress_container", this.rootDiv);
        this.progressBar = this.addUiElement("div", "rsvp_progress_bar", this.progressContainer);
        this.timeRemainingDisplay = this.addUiElement("div", "rsvp_time_remaining", this.rootDiv);
        this.controlsDiv = this.addUiElement("div", "rsvp_controls", this.rootDiv);
        this.wpmSelect = this.addUiElement("select", "rsvp_wpm", this.controlsDiv);
        let savedWpm = 350;
        try { savedWpm = parseInt(localStorage.getItem('rsvp_reader_wpm'), 10); } catch (e) { /* localStorage may be blocked */ }
        if (!savedWpm || savedWpm < 200 || savedWpm > 1000 || savedWpm % 50 !== 0) { savedWpm = 350; }
        for (let wpm = 200; wpm <= 1000; wpm += 50) {
            const wpmOption = document.createElement("option"); wpmOption.text = `${wpm} wpm`; wpmOption.value = String(wpm);
            if (wpm === savedWpm) { wpmOption.selected = true; } this.wpmSelect.add(wpmOption);
        }
        this.startButton = this.addUiElement("button", "rsvp_start", this.controlsDiv);
        this.startButton.textContent = "Start";
        this.closeButton = this.addUiElement("button", "rsvp_close", this.controlsDiv);
        this.closeButton.textContent = "Close";
     }

    // --- UI Helper ---
    addUiElement(type, id, parent) {
      const element = document.createElement(type); element.id = id;
      if (parent) { parent.appendChild(element); } return element;
    }

    // --- Event Listener Setup ---
    // Document-level handlers are kept as instance properties so remove() can detach them.
    attachEventListeners() {
        this.onMouseMove = (event) => {
            if (this.mouseDown) {
                let newX = event.clientX - this.dragOffsetX; let newY = event.clientY - this.dragOffsetY; const PADDING = 10;
                newX = Math.max(PADDING, Math.min(newX, window.innerWidth - this.rootDiv.offsetWidth - PADDING));
                newY = Math.max(PADDING, Math.min(newY, window.innerHeight - this.rootDiv.offsetHeight - PADDING));
                this.rootDiv.style.left = `${newX}px`; this.rootDiv.style.top = `${newY}px`; this.rootDiv.style.transform = '';
            }
        };
        this.onMouseUp = () => { if (this.mouseDown) { this.mouseDown = false; this.rootDiv.style.transition = ''; } };
        this.onKeyDown = (event) => {
            const target = event.target;
            if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName || ''))) { return; }
            if (event.key === ' ') {
                event.preventDefault();
                if (this.isPlaying) { this.pause(); } else { this.start(); }
            } else if (event.key === 'Escape') {
                this.remove();
            } else if (event.key === 'ArrowLeft') {
                this.rewind(10);
            }
        };
        this.dragHandle.addEventListener('mousedown', (event) => {
            this.mouseDown = true; this.dragOffsetX = event.clientX - this.rootDiv.offsetLeft; this.dragOffsetY = event.clientY - this.rootDiv.offsetTop;
            this.rootDiv.style.transition = 'none'; event.preventDefault();
        });
        document.addEventListener('mousemove', this.onMouseMove, { passive: true });
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('keydown', this.onKeyDown);
        this.startButton.addEventListener('click', () => { if (this.isPlaying) { this.pause(); } else { this.start(); } });
        this.closeButton.addEventListener('click', () => { this.remove(); });
        this.controlsDiv.addEventListener('mousedown', (event) => { event.stopPropagation(); });
        this.wpmSelect.addEventListener('change', this.handleWpmChange);
     }

    // --- Rewind N words (works while playing or paused) ---
    rewind(wordCount) {
        if (!this.words || this.words.length === 0) { return; }
        this.currentWordIndex = Math.max(0, this.currentWordIndex - wordCount);
        this.setWord(this.words[this.currentWordIndex]);
        this.updateProgressDisplay();
    }

    // --- Get Current WPM Setting ---
    getWPM() { const selectedWpm = parseInt(this.wpmSelect.value, 10); return Math.max(50, selectedWpm); }

    // --- Display-time multiplier for a word ---
    // Longer pause after sentence/clause punctuation (also when followed by a
    // closing quote/bracket, e.g. word." or word!) ) and after long words.
    getWordMultiplier(word) {
        const hasPausePunctuation = /[.,:;?!]["'”’)\]]*$/.test(word);
        return (hasPausePunctuation || word.length > 8) ? 1.6 : 1;
    }

    // --- Display Word and Align Pivot ---
    setWord(word) {
        const NBSP = '\u00A0'; const MAX_PADDING = 15; if (!word) { word = ''; } word = String(word).trim();
        let pivotIndex = 0; const len = word.length;
        if (len === 0) {} else if (len === 1) { pivotIndex = 0; } else if (len % 2 !== 0) { pivotIndex = Math.floor(len / 2); } else { pivotIndex = Math.floor(len / 2) - 1; }
        const pivotChar = word.charAt(pivotIndex) || ''; let formerPart = word.slice(0, pivotIndex); let latterPart = word.slice(pivotIndex + 1);
        let formerPadding = ''; let latterPadding = '';
        if (len > 0) {
            const PIVOT_CENTER_OFFSET = 0.4; const widthDiff = (formerPart.length + PIVOT_CENTER_OFFSET) - (latterPart.length + (1.0 - PIVOT_CENTER_OFFSET));
            const paddingAmount = Math.round(Math.abs(widthDiff)); const limitedPadding = Math.min(MAX_PADDING, paddingAmount);
            if (widthDiff > 0) { latterPadding = NBSP.repeat(limitedPadding); } else if (widthDiff < 0) { formerPadding = NBSP.repeat(limitedPadding); }
        }
        // Shrink font for very long words/tokens (e.g. URLs) so they fit the panel
        const totalChars = formerPadding.length + formerPart.length + 1 + latterPart.length + latterPadding.length;
        this.wordWrapper.style.fontSize = totalChars > 20 ? `${Math.max(12, Math.floor(600 / totalChars))}px` : '';
        this.former.textContent = formerPadding + formerPart; this.pivot.textContent = pivotChar || NBSP; this.latter.textContent = latterPart + latterPadding;
     }

    // --- Display a plain status message (no pivot highlight) ---
    setStatus(message) {
        message = String(message);
        this.wordWrapper.style.fontSize = message.length > 20 ? `${Math.max(12, Math.floor(600 / message.length))}px` : '';
        this.former.textContent = message; this.pivot.textContent = ''; this.latter.textContent = '';
     }

    // --- Time Formatting Helper ---
    formatTime(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0) { return "-"; }
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const paddedSeconds = seconds < 10 ? '0' + seconds : seconds;
        return `${minutes}m ${paddedSeconds}s`;
    }

    // --- Update Progress Bar and Time Remaining ---
    updateProgressDisplay() {
        if (!this.words || this.words.length === 0) {
            this.progressBar.style.width = '0%';
            this.timeRemainingDisplay.textContent = "-"; return;
        }
        const progressPercent = (this.currentWordIndex / this.words.length) * 100;
        this.progressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
        const currentWpm = this.getWPM(); let totalSecondsRemaining = 0;
        if (currentWpm > 0 && this.currentWordIndex < this.words.length) {
            // Sum per-word multipliers so punctuation/long-word pauses are included
            const baseSeconds = 60 / currentWpm; let intervals = 0;
            for (let i = this.currentWordIndex; i < this.words.length; i++) {
                intervals += this.getWordMultiplier(this.words[i]);
            }
            totalSecondsRemaining = intervals * baseSeconds;
        }
        // Update display only if playing or just started (words list available)
        if (this.isPlaying || this.currentWordIndex === 0 && this.words.length > 0) {
             this.timeRemainingDisplay.textContent = this.formatTime(totalSecondsRemaining);
        } else if (this.currentWordIndex === this.words.length) { 
            this.timeRemainingDisplay.textContent = this.formatTime(0);
        }
        else {  // Handle stopped/initial state
            this.timeRemainingDisplay.textContent = "-"; 
        }
    }


    // --- Start Reading Process ---
    start() {
        if (this.currentWordIndex === 0) {
            let textToUse = this.getSelectedText();
            if (!textToUse) {
                const mainContentElement = this.findMainContentElement();
                if (mainContentElement) { textToUse = this.extractText(mainContentElement); }
            }
            if (!textToUse || textToUse.length < 10) {
                this.setStatus("Select text or find content?");
                alert("Please select text on the page. RSVP couldn't automatically find the main content.");
                this.updateProgressDisplay(); // Ensure reset state
                return;
            }
            this.words = textToUse.split(/\s+/).filter(w => w.length > 0);
            if (this.words.length === 0) {
                 this.setStatus("No words found?");
                 this.updateProgressDisplay(); // Ensure reset state
                 return;
            }
            this.currentWordIndex = 0; 
            this.updateProgressDisplay();
        }
        if (this.words.length === 0 || this.currentWordIndex >= this.words.length) { 
            this.stop();
            return; 
        }
        this.isPlaying = true; this.startButton.textContent = "Pause";
        clearTimeout(this.intervalId);
        const baseInterval = 60000 / this.getWPM();
        this.intervalId = setTimeout(this.tick, baseInterval);
    }

    // --- Pause Reading ---
    pause() {
      clearTimeout(this.intervalId); this.intervalId = null; 
      this.isPlaying = false;
      this.startButton.textContent = "Continue";
      // Progress and time display remain unchanged on pause
    }

    // --- Stop Reading and Reset ---
    stop() {
        clearTimeout(this.intervalId); 
        this.intervalId = null;
        this.currentWordIndex = 0; this.isPlaying = false;
        this.startButton.textContent = "Start";
        // Reset progress bar and time display fully on stop
        this.progressBar.style.width = '0%';
        this.timeRemainingDisplay.textContent = "-";
        // Optionally reset display word: // this.setWord("Stopped.");
    }

    // --- Remove Reader from Page ---
    remove() {
        this.pause();
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('keydown', this.onKeyDown);
        if (this.rootDiv && this.rootDiv.parentNode) { this.rootDiv.remove(); }
        if (this.styleSheet && this.styleSheet.parentNode) { this.styleSheet.remove(); }
        if (this.wpmSelect && this.handleWpmChange) { this.wpmSelect.removeEventListener('change', this.handleWpmChange); }
        if (window.rsvpInstance === this) { window.rsvpInstance = null; }
        console.log("RSVP instance removed.");
     }

  } // End RSVPReader Class

  // --- Initialize ---
  try {
      if (window.rsvpInstance) { 
        console.log("Removing existing RSVP instance."); 
        window.rsvpInstance.remove(); 
    }
      window.rsvpInstance = new RSVPReader();
  } catch (error) {
      console.error("Failed to initialize RSVP:", error);
      alert("Error initializing RSVP reader. See console for details.");
  }
  
})(); // End bookmarklet IIFE
