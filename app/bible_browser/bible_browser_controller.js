/* This file is part of Ezra Project.

   Copyright (C) 2019 - 2020 Tobias Klein <contact@ezra-project.net>

   Ezra Project is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   Ezra Project is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with Ezra Project. See the file LICENSE.
   If not, see <http://www.gnu.org/licenses/>. */

const { clipboard } = require('electron');

const Mousetrap = require('mousetrap');
const VerseSelection = require("../components/verse_selection.js");
const TagSelectionMenu = require("../tags/tag_selection_menu.js");
const TagReferenceBox = require("../tags/tag_reference_box.js");
const TagAssignmentMenu = require("../tags/tag_assignment_menu.js");
const ModuleSearch = require("../components/module_search.js");
const TranslationController = require("./translation_controller.js");
const InstallModuleWizard = require("../module_wizard/install_module_wizard.js");
const RemoveModuleWizard = require("../module_wizard/remove_module_wizard.js");
const TextLoader = require("./text_loader.js");
const VerseContextLoader = require("./verse_context_loader.js");
const BookSearch = require("../tab_search/tab_search.js");
const TabController = require("./tab_controller.js");
const OptionsMenu = require("../components/options_menu.js");
const NavigationPane = require("../components/navigation_pane.js");
const TaggedVerseExport = require("../tags/tagged_verse_export.js");
const TranslationComparison = require("../components/translation_comparison.js");
const BookSelectionMenu = require("../components/book_selection_menu.js");
const TagStatistics = require("../tags/tag_statistics.js");
const DictionaryController = require("../components/dictionary_controller.js");
const NotesController = require("./notes_controller.js");
const SwordNotes = require("../components/sword_notes.js");

class BibleBrowserController {
  constructor() {
    this.book_menu_is_opened = false;
    this.current_cr_verse_id = null;
  }

  init_component(componentClassName, componentName) {
    var expression = "";
    expression += "this." + componentName + " = new " + componentClassName + "();";
    eval(expression);
  }

  async init() {
    this.verse_list_menu_template = $($('.verse-list-menu')[0]).html();
    this.verse_list_composite_template = $($('.verse-list-composite')[0]).html();
    //this.settings = require('electron-settings');

    this.init_component("VerseSelection", "verse_selection");
    this.init_component("TagSelectionMenu", "tag_selection_menu");
    this.init_component("TagReferenceBox", "tag_reference_box");
    this.init_component("TagAssignmentMenu", "tag_assignment_menu");
    this.init_component("ModuleSearch", "module_search");
    this.init_component("TranslationController", "translation_controller");
    this.init_component("InstallModuleWizard", "install_module_wizard");
    this.init_component("RemoveModuleWizard", "remove_module_wizard");
    this.init_component("TextLoader", "text_loader");
    this.init_component("VerseContextLoader", "verse_context_loader");
    this.init_component("BookSearch", "tab_search");
    this.init_component("TabController", "tab_controller");
    this.init_component("OptionsMenu", "optionsMenu");
    this.init_component("NavigationPane", "navigation_pane");
    this.init_component("TaggedVerseExport", "taggedVerseExport");
    this.init_component("TranslationComparison", "translationComparison");
    this.init_component("BookSelectionMenu", "book_selection_menu");
    this.init_component("TagStatistics", "tag_statistics");
    this.init_component("DictionaryController", "dictionary_controller");
    this.init_component("NotesController", "notes_controller");
    this.init_component("SwordNotes", "sword_notes");

    this.tag_reference_box.initTagReferenceBox();
    this.initGlobalShortCuts();

    this.translation_controller.init(() => { this.onBibleTranslationChanged(); });
    this.remove_module_wizard.init(() => { this.onAllTranslationsRemoved(); },
                                   () => { this.onTranslationRemoved(); });

    this.tab_search.init('#tab-search',
                          '#tab-search-input',
                          '#tab-search-occurances',
                          '#tab-search-previous',
                          '#tab-search-next',
                          '#tab-search-is-case-sensitive',
                          '#tab-search-type',
                          (occurances) => { this.onSearchResultsAvailable(occurances); },
                          () => { this.onSearchReset(); });

    var bibleTranslations = nsi.getAllLocalModules();
    var defaultBibleTranslationId = null;
    if (bibleTranslations.length > 0) {
      var defaultBibleTranslationId = bibleTranslations[0].name;
      this.book_selection_menu.init();
    }

    var tabHtmlTemplate = this.getTabHtmlTemplate();
    this.tab_controller.init('verse-list-tabs',
                             'verse-list-container',
                             'add-tab-button',
                             this.settings,
                             tabHtmlTemplate,
                             (event = undefined, ui = { 'index' : 0}) => { this.onTabSelected(event, ui); },
                             (previousTabIndex, tabIndex) => { this.onTabAdded(previousTabIndex, tabIndex); },
                             defaultBibleTranslationId);
  }

  async onSearchResultsAvailable(occurances) {
    // We need to re-initialize the Strong's event handlers, because the search function rewrote the verse html elements
    this.dictionary_controller.bindAfterBibleTextLoaded();

    var currentVerseListFrame = this.getCurrentVerseListFrame();
    var bookHeaders = currentVerseListFrame.find('.tag-browser-verselist-book-header');

    // Highlight occurances in navigation pane
    for (var i = 0; i < occurances.length; i++) {
      var currentOccurance = $(occurances[i]);
      var verseBox = currentOccurance.closest('.verse-box');
      var currentTab = this.tab_controller.getTab();
      var currentTextType = currentTab.getTextType();

      if (currentTextType == 'book') {
        // Highlight chapter if we are searching in a book

        var verseReferenceContent = verseBox.find('.verse-reference-content').text();
        var chapter = this.getChapterFromReference(verseReferenceContent);
        this.navigation_pane.highlightSearchResult(chapter);

      } else {

        // Highlight bible book if we are searching in a tagged verses list
        var currentBibleBookShortName = verseBox.find('.verse-bible-book-short').text();
        var currentBookName = models.BibleBook.getBookTitleTranslation(currentBibleBookShortName);

        var bibleBookNumber = this.getVerseListBookNumber(currentBookName, bookHeaders);
        if (bibleBookNumber != -1) {
          this.navigation_pane.highlightSearchResult(bibleBookNumber);
        }
      }
    }
  }

  onSearchReset() {
    this.navigation_pane.clearHighlightedSearchResults();

    // We need to re-initialize the Strong's event handlers, because the search function rewrote the verse html elements
    this.dictionary_controller.bindAfterBibleTextLoaded();
  }

  async onTabSelected(event = undefined, ui = { 'index' : 0}) {
    await waitUntilIdle();

    var metaTab = this.tab_controller.getTab(ui.index);

    if (metaTab.selectCount >= 2) {
      // Only perform the following actions from the 2nd select (The first is done when the tab is created)

      this.hideAllMenus();
      this.book_selection_menu.clearSelectedBookInMenu();
    }

    // Refresh the view based on the options selected
    this.optionsMenu.refreshViewBasedOnOptions(ui.index);

    // When switching tabs we need to end any note editing.
    this.notes_controller.restoreCurrentlyEditedNotes();

    // Re-configure tab search
    this.tab_search.resetSearch();
    var currentVerseList = this.getCurrentVerseList(ui.index);
    this.tab_search.setVerseList(currentVerseList);

    // Clear verse selection
    this.verse_selection.clear_verse_selection();

    // Refresh tags view
    // Assume that verses were selected before, because otherwise the checkboxes may not be properly cleared
    tags_controller.verses_were_selected_before = true;
    await this.updateTagsView(ui.index);

    // Refresh tags selection menu (It's global!)
    await this.tag_selection_menu.updateTagSelectionMenu(ui.index);

    // Update available books for current translation
    this.translation_controller.updateAvailableBooks(ui.index);

    // Refresh translations menu
    this.translation_controller.initTranslationsMenu(-1, ui.index);

    // Highlight currently selected book (only in book mode)
    var textType = this.tab_controller.getTab(ui.index)?.getTextType();
    if (textType == 'book') {
      this.book_selection_menu.highlightCurrentlySelectedBookInMenu(ui.index);
    }

    // Toggle book statistics
    this.tag_statistics.toggle_book_tags_statistics_button(ui.index);

    // Populate search menu based on last search (if any)
    this.module_search.populateSearchMenu(ui.index);

    // Hide elements present from previous tab's usage
    this.dictionary_controller.hideStrongsBox();
    this.verse_context_loader.hide_verse_expand_box();

    uiHelper.configureButtonStyles('.verse-list-menu');
  }

  onTabAdded(previousTabIndex, tabIndex=0) {
    this.hideAllMenus();
    // Refresh the view based on the options selected
    this.optionsMenu.refreshViewBasedOnOptions(tabIndex);
    uiHelper.resizeVerseList(tabIndex);
    
    this.initCurrentVerseListMenu(tabIndex);
    this.tag_selection_menu.init(tabIndex);
    this.tag_assignment_menu.init(tabIndex);
    this.module_search.initModuleSearchMenu(tabIndex);
    this.translation_controller.initTranslationsMenu(previousTabIndex, tabIndex);
    this.translation_controller.initBibleTranslationInfoButton();
    var currentBibleTranslationId = this.tab_controller.getTab(tabIndex)?.getBibleTranslationId();
    if (currentBibleTranslationId != null) {
      this.translation_controller.enableCurrentTranslationInfoButton(tabIndex);
    }

    this.optionsMenu.initCurrentOptionsMenu(tabIndex);
    this.book_selection_menu.clearSelectedBookInMenu();
  }

  onBibleTranslationChanged() {
    // The tab search is not valid anymore if the translation is changing. Therefore we reset it.
    this.tab_search.resetSearch();

    var currentTab = this.tab_controller.getTab();

    if (currentTab.getTextType() == 'search_results') {
      this.text_loader.prepareForNewText(true, true);
      this.module_search.startSearch(null, this.tab_controller.getSelectedTabIndex(), currentTab.getSearchTerm());
    } else {
      if (!this.tab_controller.isCurrentTabEmpty()) {
        this.text_loader.prepareForNewText(false, false);
        this.text_loader.requestTextUpdate(this.tab_controller.getSelectedTabId(),
                                           currentTab.getBook(),
                                           currentTab.getTagIdList(),
                                           null,
                                           null);
      }
    }
  }

  // Re-init application to state without Bible translations
  onAllTranslationsRemoved() {
    this.tab_controller.reset();
    this.resetVerseListView();
    this.hideVerseListLoadingIndicator();
    this.getCurrentVerseList().append("<div class='help-text'>" + i18n.t("help.help-text-no-translations") + "</div>");
    this.translation_controller.disableCurrentTranslationInfoButton();    
    $('.book-select-value').text(i18n.t("menu.book"));
  }

  onTranslationRemoved() {
    $("select#bible-select").empty();
    this.translation_controller.initTranslationsMenu();
    tags_controller.updateTagUiBasedOnTagAvailability();
  }

  getTabHtmlTemplate() {
    var tabHtmlTemplate = "";

    tabHtmlTemplate += "<div class='verse-list-menu'>";
    tabHtmlTemplate += this.verse_list_menu_template;
    tabHtmlTemplate += "</div>";

    tabHtmlTemplate += "<div class='verse-list-composite'>";
    tabHtmlTemplate += this.verse_list_composite_template;
    tabHtmlTemplate += "</div>";

    return tabHtmlTemplate;
  }

  async loadSettings() {
    if (this.settings.get('tag_list_width') &&
        this.settings.get('tag_list_width') != null) {

      $('#bible-browser-toolbox').css('width', this.settings.get('tag_list_width'));
      uiHelper.resizeAppContainer();
    }

    if (await models.Tag.getTagCount() > 0) {
      tags_controller.showTagListLoadingIndicator();
    }

    await this.tab_controller.loadTabConfiguration();
    this.translation_controller.loadSettings();
    this.tab_controller.bindEvents();
  }

  initCurrentVerseListMenu(tabIndex=undefined) {
    var currentVerseListMenu = this.getCurrentVerseListMenu(tabIndex);

    currentVerseListMenu.find('.fg-button').removeClass('events-configured');
    
    var bookSelectButton = currentVerseListMenu.find('.book-select-button');
    bookSelectButton.bind('click', (event) => {
      this.book_selection_menu.handle_book_menu_click(event);
    });

    currentVerseListMenu.find('.new-standard-tag-button').bind('click', function() {
      tags_controller.handle_new_tag_button_click($(this), "standard");
    });

    this.translationComparison.initButtonEvents();

    var tabId = this.tab_controller.getSelectedTabId(tabIndex);
    if (tabId !== undefined) {
      uiHelper.configureButtonStyles('#' + tabId);
    }

    this.navigation_pane.updateNavigation();
  }

  initGlobalShortCuts() {
    var shortCut = 'ctrl+c';
    if (isMac()) {
      shortCut = 'command+c';
    }

    Mousetrap.bind(shortCut, () => {
      this.copySelectedVersesToClipboard();
      return false;
    });
  }
  
  getLineBreak() {
    if (process.platform === 'win32') {
      return "\r\n";
    } else {
      return "\n";
    }
  }

  copySelectedVersesToClipboard() {    
    var selectedVerseBoxes = bible_browser_controller.verse_selection.selected_verse_boxes;
    
    var selectedText = "";

    for (var i = 0; i < selectedVerseBoxes.length; i++) {
      var currentVerseBox = $(selectedVerseBoxes[i]);
      var verseReferenceContent = currentVerseBox.find('.verse-reference-content').text();
      var currentVerseNr = verseReferenceContent.split(reference_separator)[1];
      
      var currentText = currentVerseBox.find('.verse-text').clone();
      currentText.find('.sword-markup').remove();

      selectedText += "<sup>" + currentVerseNr + "</sup> " + currentText.text().trim() + " ";
    }

    selectedText = selectedText.trim();
    selectedText += " " + this.getLineBreak() + this.verse_selection.getSelectedVersesLabel().text();

    clipboard.writeHTML(selectedText);
  }

  getCurrentVerseListTabs(tabIndex=undefined) {
    var selectedTabId = this.tab_controller.getSelectedTabId(tabIndex);
    var currentVerseListTabs = $('#' + selectedTabId);
    return currentVerseListTabs;
  }

  getCurrentVerseListMenu(tabIndex=undefined) {
    var currentVerseListTabs = this.getCurrentVerseListTabs(tabIndex);
    var currentVerseListMenu = currentVerseListTabs.find('.verse-list-menu');
    return currentVerseListMenu;
  }

  getCurrentVerseListComposite(tabIndex=undefined) {
    var currentVerseListTabs = this.getCurrentVerseListTabs(tabIndex);
    var currentVerseListComposite = currentVerseListTabs.find('.verse-list-composite');
    return currentVerseListComposite;
  }

  getCurrentVerseListFrame(tabIndex=undefined) {
    var currentVerseListComposite = this.getCurrentVerseListComposite(tabIndex);
    var currentVerseListFrame = currentVerseListComposite.find('.verse-list-frame');
    return currentVerseListFrame;
  }

  getCurrentVerseList(tabIndex=undefined) {
    var currentVerseListFrame = this.getCurrentVerseListFrame(tabIndex);
    var verseList = currentVerseListFrame.find('.verse-list');
    return verseList;
  }

  getCurrentVerseListLoadingIndicator() {
    var currentVerseListComposite = this.getCurrentVerseListComposite();
    var loadingIndicator = currentVerseListComposite.find('.verse-list-loading-indicator');
    return loadingIndicator;
  }

  getCurrentSearchProgressBar() {
    var currentVerseListComposite = this.getCurrentVerseListComposite();
    var searchProgressBar = currentVerseListComposite.find('.search-progress-bar');
    return searchProgressBar;
  }

  showVerseListLoadingIndicator(message=undefined, withLoader=true) {
    var loadingIndicator = this.getCurrentVerseListLoadingIndicator();
    var loadingText = loadingIndicator.find('.verse-list-loading-indicator-text');
    if (message === undefined) {
      message = i18n.t("bible-browser.loading-bible-text");
    }

    loadingText.html(message);

    if (withLoader) {
      loadingIndicator.find('.loader').show();
    } else {
      loadingIndicator.find('.loader').hide();
    }

    loadingIndicator.show();
  }

  hideVerseListLoadingIndicator() {
    var loadingIndicator = this.getCurrentVerseListLoadingIndicator();
    loadingIndicator.hide();
  }

  hideSearchProgressBar() {
    var searchProgressBar = this.getCurrentSearchProgressBar();
    searchProgressBar.hide();
  }

  async updateTagsView(tabIndex) {
    tags_controller.showTagListLoadingIndicator();
    var currentTab = this.tab_controller.getTab(tabIndex);

    if (currentTab !== undefined) {
      var currentTabBook = currentTab.getBook();
      var currentTagIdList = currentTab.getTagIdList();
      var currentSearchTerm = currentTab.getSearchTerm();
      if ((currentTabBook != undefined && currentTabBook != null) || currentTagIdList != null || currentSearchTerm != null) {
        await tags_controller.update_tag_list(currentTabBook);
      }
    }
  }

  handleBodyClick(event) {
    if($(this).hasClass('verse-selection-menu')) {
      event.stopPropagation();
      return;
    }
    
    bible_browser_controller.hideAllMenus();
    bible_browser_controller.notes_controller.restoreCurrentlyEditedNotes();
    bible_browser_controller.tab_search.blurInputField();
  }

  hideAllMenus() {
    this.book_selection_menu.hide_book_menu();
    this.tag_selection_menu.hideTagMenu();
    this.tag_assignment_menu.hideTagAssignmentMenu();
    this.module_search.hideSearchMenu();
    this.optionsMenu.hideDisplayMenu();
  }

  async bindEventsAfterBibleTextLoaded(tabIndex=undefined, preventDoubleBinding=false) {
    var currentVerseList = this.getCurrentVerseList(tabIndex);

    var tagBoxes = currentVerseList.find('.tag-box');
    var tags = currentVerseList.find('.tag');

    if (preventDoubleBinding) {
      tagBoxes = tagBoxes.filter(":not('.tag-events-configured')");
      tags = tags.filter(":not('.tag-events-configured')");
    }

    tagBoxes.bind('click', tags_controller.clear_verse_selection).addClass('tag-events-configured');
    tags.bind('click', (event) => {
      this.tag_reference_box.handleTagReferenceClick(event);
    }).addClass('tag-events-configured');

    currentVerseList.find('.verse-box').bind('mouseover', (e) => { this.onVerseBoxMouseOver(e); });
    this.dictionary_controller.bindAfterBibleTextLoaded(tabIndex);
    this.verse_context_loader.init_verse_expand_box(tabIndex);
  }

  getVerseListBookNumber(bibleBookLongTitle, bookHeaders=undefined) {
    var bibleBookNumber = -1;

    if (bookHeaders === undefined) {
      var currentVerseListFrame = this.getCurrentVerseListFrame();
      bookHeaders = currentVerseListFrame.find('.tag-browser-verselist-book-header');
    }

    for (var i = 0; i < bookHeaders.length; i++) {
      var currentBookHeader = $(bookHeaders[i]);
      var currentBookHeaderText = currentBookHeader.text();

      if (currentBookHeaderText.includes(bibleBookLongTitle)) {
        bibleBookNumber = i + 1;
        break;
      }
    }

    return bibleBookNumber;
  }

  async onVerseBoxMouseOver(event) {
    var verseBox = $(event.target).closest('.verse-box');
    var currentTab = this.tab_controller.getTab();
    var currentBook = currentTab.getBook();
    var currentTagIdList = currentTab.getTagIdList();
    var currentTextType = currentTab.getTextType();

    if (currentTextType == 'book' && currentBook != null) {

      var verseReferenceContent = verseBox.find('.verse-reference-content').text();
      var mouseOverChapter = this.getChapterFromReference(verseReferenceContent);
      this.navigation_pane.highlightNavElement(mouseOverChapter);

    } else if (currentTextType == 'tagged_verses' && currentTagIdList != null || currentTextType == 'search_results') {

      var bibleBookShortTitle = verseBox.find('.verse-bible-book-short').text();
      var currentBookName = models.BibleBook.getBookTitleTranslation(bibleBookShortTitle);
      
      var bibleBookNumber = this.getVerseListBookNumber(currentBookName);
      if (bibleBookNumber != -1) {
        this.navigation_pane.highlightNavElement(bibleBookNumber);
      }
    }
  }

  async getTaggedVerses() {
    var currentTagIdList = this.tab_controller.getTab().getTagIdList();
    var currentTabId = this.tab_controller.getSelectedTabId();
    var currentVerseList = this.getCurrentVerseList();

    this.tab_search.setVerseList(currentVerseList);

    if (currentTagIdList != "") {
      this.text_loader.prepareForNewText(true, false);
      this.text_loader.requestTextUpdate(currentTabId, null, currentTagIdList, null, null);
      await tags_controller.update_tag_list();
    }
  }

  resetVerseListView() {
    var currentVerseList = this.getCurrentVerseList()[0];
    if (currentVerseList != undefined) {
      while(currentVerseList.firstChild) {
        currentVerseList.removeChild(currentVerseList.firstChild);
      }
    }

    this.navigation_pane.resetNavigationPane();
    this.taggedVerseExport?.disableTaggedVersesExportButton();
  }

  initApplicationForVerseList(tabIndex=undefined) {
    var selectedTabIndex = this.tab_controller.getSelectedTabIndex();
    var tabIsCurrentTab = false;

    if (tabIndex == selectedTabIndex) {
      tabIsCurrentTab = true;
    }

    if (tabIndex === undefined) {
      var tabIndex = selectedTabIndex;
    }

    if (tabIsCurrentTab) {
      this.tag_statistics.toggle_book_tags_statistics_button(tabIndex);
    }

    this.verse_selection.init(tabIndex);
    this.navigation_pane.updateNavigation(tabIndex);
    this.bindEventsAfterBibleTextLoaded(tabIndex);
    this.notes_controller.initForTab(tabIndex);
    this.sword_notes.initForTab(tabIndex);
  }

  updateUiAfterBibleTranslationAvailable(translationCode) {
    var bibleTranslations = nsi.getAllLocalModules();
    if (bibleTranslations.length == 1) {
      this.book_selection_menu.init();
    }

    var currentBibleTranslationId = this.tab_controller.getTab().getBibleTranslationId();
    if (currentBibleTranslationId == "" || 
        currentBibleTranslationId == null) { // Update UI after a Bible translation becomes available

      this.tab_controller.setCurrentBibleTranslationId(translationCode);
      this.translation_controller.updateAvailableBooks();
      this.translation_controller.enableCurrentTranslationInfoButton();
    }
  }

  openModuleSettingsWizard(moduleType) {
    this.optionsMenu.hideDisplayMenu();
    this.install_module_wizard.openWizard(moduleType);
  }

  getChapterFromReference(reference) {
    var chapter = Number(reference.split(reference_separator)[0]);
    return chapter;
  }

  getVerseFromReference(reference) {
    var verse = Number(reference.split(reference_separator)[1]);
    return verse;
  }

  jumpToReference(reference, highlight) {
    var currentTabId = this.tab_controller.getSelectedTabId();
    var chapter = this.getChapterFromReference(reference);
    var verse = this.getVerseFromReference(reference);

    var uniqueReference = '#' + currentTabId + ' ' + chapter + ':' + verse;

    if (chapter == 1 && verse < 5) {
      var currentVerseListComposite = this.getCurrentVerseListComposite();
      currentVerseListComposite[0].scrollTop = 0;
    } else {
      window.location = uniqueReference;
    }

    this.navigation_pane.highlightNavElement(chapter);

    /*if (highlight) { // FIXME
      original_verse_box.glow();
    }*/
  }
}

module.exports = BibleBrowserController;