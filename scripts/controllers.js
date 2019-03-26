/* Controllers */
var eventCaptureControllers = angular.module('eventCaptureControllers', ['ngCsv'])

//Controller for settings page
.controller('MainController',
        function($rootScope,
                $scope,
                $route,
                $modal,
                $translate,
                $anchorScroll,
                $window,
                $q,
                $log,
                $filter,
                $timeout,
                $location,
                orderByFilter,
                SessionStorageService,
                Paginator,
                MetaDataFactory,
                ProgramFactory,                               
                DHIS2EventFactory,
                DHIS2EventService,
                ContextMenuSelectedItem,                
                DateUtils,
                CalendarService,
                GridColumnService,
                CustomFormService,
                ECStorageService,
                CurrentSelection,
                ModalService,
                DialogService,
                CommonUtils,
                AuthorityService,
                TrackerRulesExecutionService,
                OrgUnitFactory,
                NotificationService,
                OptionSetService) {
    $scope.forms = {};
    $scope.maxOptionSize = 100;
    $scope.treeLoaded = false;    
    $scope.selectedSection = {id: 'ALL'};    
    $rootScope.ruleeffects = {};
    $scope.hiddenFields = [];
    $scope.assignedFields = [];
    $scope.mandatoryFields = [];
    $scope.calendarSetting = CalendarService.getSetting();
    $scope.timeFormat = "24h";
    
    var setCurrentEvent = function(ev){
        $scope.currentEvent = ev;
        if($scope.currentEvent && $scope.currentEvent.event){
            $scope.currentEventExpired = DHIS2EventFactory.isExpired($scope.selectedProgram, $scope.currentEvent);
        }
    }
    //Paging
    $scope.pager = {pageSize: 50, page: 1, toolBarDisplay: 5};
    
    function resetView(){
        $scope.eventRegistration = false;
        $scope.editingEventInFull = false;
        $scope.editingEventInGrid = false;        
    }
    
    resetView();
    
    
    $scope.editGridColumns = false;
    $scope.updateSuccess = false;
    $scope.currentGridColumnId = '';  
    $scope.dhis2Events = [];
    setCurrentEvent({});
    $scope.currentEventOriginialValue = {}; 
    $scope.displayCustomForm = false;
    $scope.currentElement = {id: '', update: false};
    $scope.optionSets = [];
    $scope.optionGroupsById = null;
    $scope.proceedSelection = true;
    $scope.formUnsaved = false;
    $scope.fileNames = {};
    $scope.currentFileNames = {};
    $scope.gridColumnsInUserStore = null;
    $scope.model = {exportFormats:["XML","JSON","CSV"], savingRegistration: false};
    
    //notes
    $scope.note = {};

    $scope.displayTextEffects = [];
    $scope.today = DateUtils.getToday();    
    $scope.noteExists = false;
    $scope.model.editingDisabled = false;
    var storedBy = CommonUtils.getUsername();    
    var orgUnitFromUrl = ($location.search()).ou;
    var eventIdFromUrl = ($location.search()).event;
    

     //watch for selection of org unit from tree
    $scope.$watch('selectedOrgUnit', function() {
        if (angular.isObject($scope.selectedOrgUnit)) {
            OrgUnitFactory.getFromStoreOrServer($scope.selectedOrgUnit.id).then(function (orgUnitFromStore) {
                if(orgUnitFromStore) {
                    $scope.model.ouDates = { startDate: orgUnitFromStore.odate, endDate: orgUnitFromStore.cdate };
                    if(orgUnitFromStore.reportDateRange) {
                        $scope.model.maxDate = orgUnitFromStore.reportDateRange.maxDate;
                        $scope.model.minDate = orgUnitFromStore.reportDateRange.minDate;
                        $scope.model.minDate = DateUtils.formatFromApiToUserCalendar($scope.model.minDate);
                        $scope.model.minDate = DateUtils.formatFromApiToUser($scope.model.minDate);
                    }
                    $scope.model.editingDisabled = orgUnitFromStore.closedStatus;
                }
            });

            $scope.pleaseSelectLabel = $translate.instant('please_select');
            $scope.registeringUnitLabel = $translate.instant('registering_unit');
            $scope.eventCaptureLabel = $translate.instant('event_capture');
            $scope.programLabel = $translate.instant('program');
            $scope.searchLabel = $translate.instant('search');
            $scope.findLabel = $translate.instant('find');
            $scope.searchOusLabel = $translate.instant('locate_organisation_unit_by_name');
            $scope.yesLabel = $translate.instant('yes');
            $scope.noLabel = $translate.instant('no');

            SessionStorageService.set('SELECTED_OU', $scope.selectedOrgUnit);

            $scope.userAuthority = AuthorityService.getUserAuthorities(SessionStorageService.get('USER_PROFILE'));
            loadOptionGroups().then(function(){
                GridColumnService.get("eventCaptureGridColumns").then(function (gridColumns) {
                    if (gridColumns && gridColumns.status !== "ERROR") {
                        $scope.gridColumnsInUserStore = gridColumns;
                    }
                    //get ouLevels
                    ECStorageService.currentStore.open().done(function () {
                        ECStorageService.currentStore.getAll('ouLevels').done(function (response) {
                            var ouLevels = angular.isObject(response) ? orderByFilter(response, '-level').reverse() : [];
                            CurrentSelection.setOuLevels(orderByFilter(ouLevels, '-level').reverse());
                        });
                    });
                    if ($scope.optionSets.length < 1) {
                        $scope.optionSets = [];
    
                        MetaDataFactory.getAll('optionSets').then(function (optionSets) {
                            angular.forEach(optionSets, function (optionSet) {
                                $scope.optionSets[optionSet.id] = optionSet;
                            });
                            $scope.loadPrograms();
                        });
                    }
                    else {
                        $scope.loadPrograms();
                    }
                });
            });
        }
    });

    var loadOptionGroups = function(){
        if($scope.optionGroupsById){
            var def = $q.defer();
            def.resolve();
            return def.promise;
        }
        return MetaDataFactory.getAll('optionGroups').then(function(optionGroups){
            if(optionGroups){
                $scope.optionGroupsById = optionGroups.toHashMap('id', function(map,obj,key) {obj.optionsById = obj.options.toHashMap('id');});
            }else{
                $scope.optionGroupsById = {};
            }
            
        });
    }

    $scope.dataElementEditable = function(de) {

        if($scope.assignedFields[de.id] || $scope.model.editingDisabled || !$scope.hasDataWrite()) {
            return false;
        }
        if($scope.currentEventExpired && !$scope.userAuthority.canEditExpiredStuff) return false;
        return true;
    }

    $scope.verifyExpiryDate = function() {
        if (!$scope.userAuthority.canEditExpiredStuff && !DateUtils.verifyExpiryDate($scope.currentEvent.eventDate, $scope.selectedProgram.expiryPeriodType,
                $scope.selectedProgram.expiryDays)) {
            $scope.currentEvent.eventDate = null;
        }
    };

    $scope.completeEnrollment = function() {
        $scope.currentEvent.status = !$scope.currentEvent.status;
    };
    
    //load programs associated with the selected org unit.

    $scope.loadPrograms = function() {
        
        $scope.resetOu = false;
        $scope.selectedProgramStage = null;
        $scope.currentStage = null;
        $scope.allProgramRules = [];
        $scope.dhis2Events = [];
        setCurrentEvent({});
        $scope.currentEventOriginialValue = {};
        $scope.fileNames = {};        
        $scope.currentFileNames = {};
        $scope.orgUnitNames = {};

        resetView();
        $scope.editGridColumns = false;
        $scope.updateSuccess = false;
        $scope.currentGridColumnId = '';           
        $scope.displayCustomForm = false;
        
        if (angular.isObject($scope.selectedOrgUnit)) {
            ProgramFactory.getProgramsByOu($scope.selectedOrgUnit, $scope.selectedProgram).then(function(response){
                $scope.programs = response.programs;
                if (eventIdFromUrl) {
                    $scope.showEventForEditing(eventIdFromUrl);
                } else {
                    $scope.selectedProgram = response.selectedProgram;
                    $scope.getProgramDetails( $scope.selectedProgram );
                }
            });
        }
    };

    $scope.showEventForEditing = function(eventId) {
        DHIS2EventFactory.get(eventId).then(function (event) {
            if (event) {
                ContextMenuSelectedItem.setSelectedItem(event);
                if(!event.coordinate) {
                    event.coordinate = {};
                }
                for (var i = 0; i < $scope.programs.length; i++) {
                    if ($scope.programs[i].id === event.program) {
                        $scope.selectedProgram = $scope.programs[i];
                        $scope.getProgramDetails( $scope.selectedProgram );                        
                        if( $scope.selectedProgram.programStages[0].id === event.programStage ){
                            $scope.formatEvent(event);
                            setCurrentEvent(angular.copy(event));
                            $scope.editingEventInFull = false;
                            $scope.showEditEventInFull();
                        }
                        break;
                    }
                }
            }
        });
    };

    
   
    function setCommonEventProps( event ){
        event.uid = event.event;
        event.eventDate = DateUtils.formatFromApiToUser(event.eventDate);
        event.lastUpdated = DateUtils.formatFromApiToUser(event.lastUpdated);
        if (event.completedDate) {
            event.completedDate = DateUtils.formatFromApiToUser(event.completedDate);
        }
        if(event.status === "ACTIVE") {
            event.status = false;
        } else if(event.status === "COMPLETED") {
            event.status = true;
        }
    };

    $scope.formatCalendar = function(date) {
        var temp = DateUtils.formatFromApiToUserCalendar(date);
        temp = DateUtils.formatFromApiToUser(temp);
        return temp;
    };
    
    $scope.formatEvent = function(event) {
        if(event.notes && event.notes.length > 0 && !$scope.noteExists){
            $scope.noteExists = true;
        }

        angular.forEach(event.dataValues, function(dataValue){
            if($scope.prStDes && $scope.prStDes[dataValue.dataElement] && dataValue.value){
                
                if(angular.isObject($scope.prStDes[dataValue.dataElement].dataElement)){
                    dataValue.value = CommonUtils.formatDataValue(null, dataValue.value, $scope.prStDes[dataValue.dataElement].dataElement, $scope.optionSets, 'USER');
                }

                event[dataValue.dataElement] = dataValue.value;
                
                switch( $scope.prStDes[dataValue.dataElement].dataElement.valueType ){
                    case "FILE_RESOURCE":
                        CommonUtils.checkAndSetFileName(event, dataValue.value, dataValue.dataElement);
                        break;
                    case "ORGANISATION_UNIT":
                        CommonUtils.checkAndSetOrgUnitName( dataValue.value );
                        break;
                }
            }
        });
        
        $scope.fileNames = CurrentSelection.getFileNames();
        $scope.orgUnitNames = CurrentSelection.getOrgUnitNames();

        setCommonEventProps( event );
        
        if( $scope.selectedProgramStage && $scope.selectedProgramStage.captureCoordinates && !event.coordinate ){
            event.coordinate = {};
        }
        
        event.state = 'FULL';
        delete event.dataValues;
    };

    $scope.formatEventFromGrid = function(event) {
        if(event.notes && event.notes.length > 0 && !$scope.noteExists){
            $scope.noteExists = true;
        }
        
        angular.forEach($scope.selectedProgramStage.programStageDataElements, function(prStDe){            
            var de = prStDe.dataElement;            
            if( event[de.id] ){
                event[de.id] = CommonUtils.formatDataValue(null, event[de.id], de, $scope.optionSets, 'USER');
                
                switch ( de.valueType ){
                    case "FILE_RESOURCE":
                        CommonUtils.checkAndSetFileName(event, event[de.id], de.id);
                        break;
                    case "ORGANISATION_UNIT":
                        CommonUtils.checkAndSetOrgUnitName( event[de.id] );                        
                        break;
                }
            }
        });
        
        setCommonEventProps( event );
        
        if( event.latitude ){
            var lat = $scope.formatNumberResult( event.latitude );
            if( event.coordinate ){
                event.coordinate.latitude = lat;
            }
            else{
                event.coordinate = {latitude: lat};
            }
        }
        
        if( event.longitude ){
            var lng = $scope.formatNumberResult( event.longitude );
            if( event.coordinate ){
                event.coordinate.longitude = lng;
            }
            else{
                event.coordinate = {longitude: lng};
            }
        }
        
        event.state = 'PARTIAL';
    };

    /* If gridCoulumns for a program is stored in user data store then it is restored when
     * the program is selected. If the grid columns are not stored then the grid columns are set
     * as the default one for that program (in $scope.search() function)
     * */
    $scope.restoreGridColumnsFromUserStore = function() {
        $scope.savedGridColumns = [];
        if($scope.gridColumnsInUserStore && $scope.selectedProgram && $scope.selectedProgram.id) {
            if ($scope.gridColumnsInUserStore[$scope.selectedProgram.id]) {
                $scope.savedGridColumns = angular.copy($scope.gridColumnsInUserStore[$scope.selectedProgram.id]);
            }
        }
    };

    $scope.getProgramDetails = function( program ){
        $scope.selectedProgram = program;
        $rootScope.ruleeffects = {};
        var showStatus, savedColumn;
        $scope.selectedOptions = [];
        $scope.selectedProgramStage = null;
        $scope.eventFetched = false;
        $scope.optionsReady = false;
        
        //Filtering
        $scope.reverse = true;
        $scope.sortHeader = {id: 'lastUpdated', direction: 'desc'};
        $scope.filterText = {};
        $scope.filterParam = '';

        if( $scope.selectedProgram && 
                $scope.selectedProgram.programStages && 
                $scope.selectedProgram.programStages[0] && 
                $scope.selectedProgram.programStages[0].id){ 
                
            //because this is single event, take the first program stage

            $scope.selectedProgramStage = $scope.selectedProgram.programStages[0];
            $scope.currentStage = $scope.selectedProgramStage;

            angular.forEach($scope.selectedProgramStage.programStageSections, function(section){
                    section.open = true;
            });

            $scope.prStDes = [];
            $scope.restoreGridColumnsFromUserStore();
            $scope.filterTypes = {};
            $scope.newDhis2Event = {};
            $scope.filterTypes['uid'] = 'TEXT';
            $scope.eventGridColumns = [];

            $scope.eventGridColumns.push({
                displayName: 'event_uid',
                id: 'uid',
                valueType: 'TEXT',
                compulsory: false,
                filterWithRange: false,
                showFilter: false,
                show: getShowStatus(false, 'uid'),
                group: 'FIXED'
            });

            $scope.eventGridColumns.push({
                displayName: $scope.selectedProgramStage.executionDateLabel ? $scope.selectedProgramStage.executionDateLabel : $translate.instant('incident_date'),
                id: 'eventDate',
                valueType: 'DATE',
                filterWithRange: true,
                compulsory: false,
                showFilter: false,
                show: getShowStatus(true, 'eventDate'),
                group: 'FIXED'
            });

            $scope.eventGridColumns.push({
                displayName: $translate.instant('last_updated'),
                id: 'lastUpdated',
                valueType: 'DATE',
                filterWithRange: true,
                compulsory: false,
                showFilter: false,
                show: getShowStatus(true, 'lastUpdated'),
                group: 'FIXED'
            });

            $scope.filterTypes['eventDate'] = 'DATE';
            $scope.filterText['eventDate'] = {};

            angular.forEach($scope.selectedProgramStage.programStageDataElements, function (prStDe) {

                $scope.prStDes[prStDe.dataElement.id] = prStDe;
                $scope.newDhis2Event[prStDe.dataElement.id] = '';

                showStatus = getShowStatus(prStDe.displayInReports, prStDe.dataElement.id);

                    //generate grid headers using program stage data elements
                    //create a template for new event
                    //for date type dataelements, filtering is based on start and end dates
                $scope.eventGridColumns.push({
                        displayName: prStDe.dataElement.displayFormName,
                        id: prStDe.dataElement.id,
                        valueType: prStDe.dataElement.valueType,
                        compulsory: prStDe.compulsory,
                        filterWithRange: prStDe.dataElement.valueType === 'DATE' ||
                        prStDe.dataElement.valueType === 'NUMBER' ||
                        prStDe.dataElement.valueType === 'INTEGER' ||
                        prStDe.dataElement.valueType === 'INTEGER_POSITIVE' ||
                        prStDe.dataElement.valueType === 'INTEGER_NEGATIVE' ||
                        prStDe.dataElement.valueType === 'INTEGER_ZERO_OR_POSITIVE' ? true : false,
                        showFilter: false,
                        show: showStatus,
                        group: 'DYNAMIC'
                });

                $scope.filterTypes[prStDe.dataElement.id] = prStDe.dataElement.valueType;

                if (prStDe.dataElement.valueType === 'DATE' ||
                    prStDe.dataElement.valueType === 'NUMBER' ||
                    prStDe.dataElement.valueType === 'INTEGER' ||
                    prStDe.dataElement.valueType === 'INTEGER_POSITIVE' ||
                    prStDe.dataElement.valueType === 'INTEGER_NEGATIVE' ||
                    prStDe.dataElement.valueType === 'INTEGER_ZERO_OR_POSITIVE') {
                    $scope.filterText[prStDe.dataElement.id] = {};
                }
            });

            $scope.emptyFilterText = angular.copy( $scope.filterText );

            $scope.customDataEntryForm = CustomFormService.getForProgramStage($scope.selectedProgramStage, $scope.prStDes, true);

            if($scope.selectedProgramStage.captureCoordinates){
                $scope.newDhis2Event.coordinate = {};
            }

            $scope.newDhis2Event.eventDate = '';
            $scope.newDhis2Event.event = 'SINGLE_EVENT';
            $scope.newDhis2Event.orgUnit = $scope.selectedOrgUnit.id;

            $scope.selectedCategories = [];
            if($scope.selectedProgram.categoryCombo && !$scope.selectedProgram.categoryCombo.isDefault && $scope.selectedProgram.categoryCombo.categories){
                $scope.selectedCategories = $scope.selectedProgram.categoryCombo.categories;
            }
            else{
                $scope.loadEvents();
            }
            $scope.optionsReady = true;

            function getShowStatus(defaultShowStatus, id) {
                var showStatus = defaultShowStatus;

                savedColumn = $filter('filter')($scope.savedGridColumns, {id: id}, true);
                if (savedColumn.length > 0) {
                    showStatus = savedColumn[0].show;
                }
                return showStatus;
            }
        }
    };
    
    function loadOptions(){
        $scope.selectedOptions = [];
        var categoryOptions = null;
        
        if ($scope.currentEvent.attributeCategoryOptions) {
            $scope.selectedOptions = $scope.currentEvent.attributeCategoryOptions.split(";");
            for (var index1 = 0; index1 < $scope.selectedCategories.length; index1++) {
                categoryOptions = $scope.selectedCategories[index1].categoryOptions;
                for(var index2=0; index2<categoryOptions.length; index2++) {
                    if(categoryOptions[index2].id === $scope.selectedOptions[index1]){
                        $scope.selectedCategories[index1].selectedOption = categoryOptions[index2];
                        break;
                    }
                }
            }
            $scope.optionsReady = true;
        }
    }
    
    $scope.getCategoryOptions = function(){
        $scope.eventFetched = false;
        $scope.optionsReady = false;
        $scope.selectedOptions = [];
        
        for (var i = 0; i < $scope.selectedCategories.length; i++) {
            if ($scope.selectedCategories[i].selectedOption && $scope.selectedCategories[i].selectedOption.id) {
                $scope.optionsReady = true;
                $scope.selectedOptions.push($scope.selectedCategories[i].selectedOption.id);
            }
            else {
                $scope.optionsReady = false;
                break;
            }
        }        
        
        if($scope.optionsReady && !$scope.eventRegistration && !$scope.editingEventInFull){
            $scope.loadEvents();
        }
    };
        
    //get events for the selected program (and org unit)
    $scope.loadEvents = function(editInGrid){
        if(!editInGrid){
            resetView();
        }
        $scope.noteExists = false;                
        $scope.eventFetched = true;
        
        $scope.attributeCategoryUrl = {cc: $scope.selectedProgram.categoryCombo.id, default: $scope.selectedProgram.categoryCombo.isDefault, cp: ""};
        if(!$scope.selectedProgram.categoryCombo.isDefault){            
            if($scope.selectedOptions.length !== $scope.selectedCategories.length){
                var dialogOptions = {
                    headerText: 'error',
                    bodyText: 'fill_all_category_options'
                };

                DialogService.showDialog({}, dialogOptions);
                return;
            }            
            $scope.attributeCategoryUrl.cp = $scope.selectedOptions.join(';');
        }
               
        if( $scope.selectedProgram && $scope.selectedProgramStage && $scope.selectedProgramStage.id){
            
            //Load events for the selected program stage and orgunit
            
            var dataElementUrl = $filter('filter')($scope.eventGridColumns, {group: 'DYNAMIC', show: true}).map(function(c){return c.id;});
            
            if( dataElementUrl && dataElementUrl.length > 0 ){
                dataElementUrl = '&dataElement=' + dataElementUrl.join(',');
            }
            else{
                dataElementUrl = '';
            }
            
            DHIS2EventFactory.getByStage($scope.selectedOrgUnit.id, $scope.selectedProgramStage.id, $scope.attributeCategoryUrl, $scope.pager, true, null, $scope.filterParam + dataElementUrl, $scope.sortHeader, $scope.selectedEventId ).then(function(data){
                var _dhis2Events = [];
                if( dhis2.ec.isOffline ) {
                    angular.forEach(data.events, function(ev){
                        $scope.formatEvent( ev );
                        _dhis2Events.push( ev );
                    });                    
                }
                else{
                    if( data && data.headers && data.rows ){
                        _dhis2Events = [];
                        angular.forEach(data.rows,function(r){
                            var ev = {};
                            for(var i=0; i<data.headers.length; i++ ){
                                ev[data.headers[i].name] = r[i];
                            }
                            $scope.formatEventFromGrid( ev );
                            _dhis2Events.push( ev );
                        });                                        

                        $scope.fileNames = CurrentSelection.getFileNames();
                        $scope.orgUnitNames = CurrentSelection.getOrgUnitNames();                       
                    }
                }
                
                if( data.metaData && data.metaData.pager ){
                    data.metaData.pager.pageSize = data.metaData.pager.pageSize ? data.metaData.pager.pageSize : $scope.pager.pageSize;
                    $scope.pager = data.metaData.pager;
                    $scope.pager.toolBarDisplay = 5;

                    Paginator.setPage($scope.pager.page);
                    Paginator.setPageCount($scope.pager.pageCount);
                    Paginator.setPageSize($scope.pager.pageSize);
                    Paginator.setItemCount($scope.pager.total);
                }

                if($scope.noteExists && !GridColumnService.columnExists($scope.eventGridColumns, 'comment')){
                    $scope.eventGridColumns.push({displayName: 'comment', id: 'comment', type: 'TEXT', filterWithRange: false, compulsory: false, showFilter: false, show: true});
                }
                        
                $scope.eventFetched = true;
                $scope.dhis2Events = _dhis2Events;
                $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            });
        }
    };    
    
    $scope.jumpToPage = function(){
        
        if($scope.pager && $scope.pager.page && $scope.pager.pageCount && $scope.pager.page > $scope.pager.pageCount){
            $scope.pager.page = $scope.pager.pageCount;
        }
        $scope.loadEvents();
    };
    
    $scope.resetPageSize = function(){
        $scope.pager.page = 1;        
        $scope.loadEvents();
    };
    
    $scope.getPage = function(page){    
        $scope.pager.page = page;
        $scope.loadEvents();
    };
    
    $scope.sortEventGrid = function(gridHeader){        
        if ($scope.sortHeader && $scope.sortHeader.id === gridHeader.id){
            $scope.reverse = !$scope.reverse;            
        }        
        $scope.sortHeader = {id: gridHeader.id, direction: $scope.reverse ? 'desc' : 'asc'};        
        $scope.loadEvents();
    };
    
    $scope.showHideColumns = function(){        
        var oldCols = ($filter('filter')(angular.copy($scope.eventGridColumns), {group: 'DYNAMIC', show: true})).length;        
        $scope.gridColumnsInUserStore = $scope.gridColumnsInUserStore ? $scope.gridColumnsInUserStore : {};        
        $scope.gridColumnsInUserStore[$scope.selectedProgram.id] = angular.copy( $scope.eventGridColumns );
        
        var modalInstance = $modal.open({
            templateUrl: 'views/column-modal.html',
            controller: 'ColumnDisplayController',
            resolve: {
                gridColumns: function () {
                    return $scope.eventGridColumns;
                },
                hiddenGridColumns: function(){
                    return ($filter('filter')($scope.eventGridColumns, {show: false})).length;
                },
                gridColumnsInUserStore: function () {
                    return $scope.gridColumnsInUserStore;
                },
                gridColumnDomainKey: function(){
                    return "eventCaptureGridColumns";
                },
                gridColumnKey: function(){
                    return $scope.selectedProgram.id;
                }
            }
        });

        modalInstance.result.then(function (gridColumns) {            
            $scope.eventGridColumns = gridColumns;
            var newCols = ($filter('filter')($scope.eventGridColumns, {group: 'DYNAMIC', show: true})).length;
            if( newCols > oldCols ){
                $scope.loadEvents();
            }            
        });
    };
    
    $scope.filterEvents = function(gridColumn, applyFilter, stayOpen){
        $scope.filterParam = '';
        $scope.selectedEventId = null;        

        angular.forEach($scope.eventGridColumns, function(col){            
            if( gridColumn ){
                if( col.id === gridColumn.id && !stayOpen){
                    col.showFilter = !col.showFilter;
                } else if(!stayOpen) {
                    col.showFilter = false;
                }
            }            
            
            if( applyFilter && $scope.filterText[col.id] ){
                if( col.group === "FIXED" ){
                    switch ( col.id ){
                        case "eventDate":
                            if( $scope.filterText[col.id].start || $scope.filterText[col.id].end ){                            
                                if( $scope.filterText[col.id].start ){
                                    $scope.filterParam += '&startDate=' + DateUtils.formatFromUserToApi($scope.filterText[col.id].start);
                                }                    
                                if( $scope.filterText[col.id].end ){
                                    $scope.filterParam += '&endDate=' + DateUtils.formatFromUserToApi($scope.filterText[col.id].end);
                                }
                            }
                            break;
                        case "lastUpdated":
                            if( $scope.filterText[col.id].start || $scope.filterText[col.id].end ){                            
                                if( $scope.filterText[col.id].start ){
                                    $scope.filterParam += '&lastUpdatedStartDate=' + DateUtils.formatFromUserToApi($scope.filterText[col.id].start);
                                }                    
                                if( $scope.filterText[col.id].end ){
                                    $scope.filterParam += '&lastUpdatedEndDate=' + DateUtils.formatFromUserToApi($scope.filterText[col.id].end);
                                }
                            }
                            break;
                        case "status":
                            $scope.filterParam += '&status=' + $scope.filterText[col.id];
                            break;
                    }                
                }
                else{                    
                    if( $scope.prStDes[col.id] && 
                            $scope.prStDes[col.id].dataElement && 
                            $scope.prStDes[col.id].dataElement.optionSetValue ){
                        
                        if( $scope.filterText[col.id].length > 0  ){
                            var filters = $scope.filterText[col.id].map(function(filt) {return filt.code;});
                            if( filters.length > 0 ){
                                $scope.filterParam += '&filter=' + col.id + ':IN:' + filters.join(';');
                            }
                        }
                    }
                    else{
                        if( col.filterWithRange ){
                            if($scope.filterText[col.id].start && $scope.filterText[col.id].start !== "" || $scope.filterText[col.id].end && $scope.filterText[col.id].end !== ""){
                                $scope.filterParam += '&filter=' + col.id;
                                if( $scope.filterText[col.id].start ){
                                    $scope.filterParam += ':GT:' + $scope.filterText[col.id].start;
                                }                    
                                if( $scope.filterText[col.id].end ){
                                    $scope.filterParam += ':LT:' + $scope.filterText[col.id].end;
                                }
                            }
                        }
                        else{
                            if(col.id === "uid") {
                                $scope.selectedEventId = $scope.filterText[col.id];
                            } else {
                                $scope.filterParam += '&filter=' + col.id + ':like:' + $scope.filterText[col.id];
                            }
                        }
                    }
                }
            }
        });
                
        if( applyFilter ){
            $scope.pager.page = 1;
            $scope.loadEvents();
        }       
    };
    
    $scope.removeStartFilterText = function(gridColumnId){
        $scope.filterText[gridColumnId].start = undefined;
    };
    
    $scope.removeEndFilterText = function(gridColumnId){
        $scope.filterText[gridColumnId].end = undefined;
    };
    
    $scope.resetFilter = function(){        
        $scope.filterText = angular.copy($scope.emptyFilterText);
        $scope.filterEvents(null, true);
    };
    
    $scope.cancel = function(){

        resetUrl();        
        if($scope.formIsChanged()){
            var modalOptions = {
                closeButtonText: 'no',
                actionButtonText: 'yes',
                headerText: 'warning',
                bodyText: 'unsaved_data_exists_proceed'
            };

            ModalService.showModal({}, modalOptions).then(function(result){
                for(var i=0; i<$scope.dhis2Events.length; i++){
                    if($scope.dhis2Events[i].event === $scope.currentEvent.event){
                        $scope.dhis2Events[i] = $scope.currentEventOriginialValue;                        
                        break;
                    }
                }
                
                resetView();
                setCurrentEvent({});
                if( !angular.equals($scope.selectedOptionsOriginal, $scope.selectedOptions) ) {
                    
                    $scope.loadEvents();
                }
                else{
                    $scope.showEventList();
                }                
            });
        }
        else{
            resetView();
            setCurrentEvent({});
            if( !angular.equals($scope.selectedOptionsOriginal, $scope.selectedOptions) ) {
                $scope.loadEvents();
            }
            else{
                $scope.showEventList();
            }
        }
    };
    
    $scope.showEventList = function(dhis2Event){
        
        ContextMenuSelectedItem.setSelectedItem(dhis2Event);
        resetView();
        $scope.currentElement.updated = false;
        setCurrentEvent({});
        $scope.fileNames['SINGLE_EVENT'] = {};
        $scope.currentElement = {};
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);        
    };
    
    $scope.showEventRegistration = function(){      
        $scope.displayCustomForm = $scope.customDataEntryForm ? true : false;
        setCurrentEvent({});
        $scope.fileNames['SINGLE_EVENT'] = {};
        $scope.currentFileNames = {};
        $scope.eventRegistration = !$scope.eventRegistration;          
        setCurrentEvent(angular.copy($scope.newDhis2Event)); 
        if($scope.outerForm){
            $scope.outerForm.submitted = false;
        }
        $scope.note = {};
        $scope.displayTextEffects = [];
        
        if($scope.selectedProgramStage.preGenerateUID){
            $scope.eventUID = dhis2.util.uid();
            $scope.currentEvent['uid'] = $scope.eventUID;
        }        
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent); 
        $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);


        if($scope.eventRegistration){
            $scope.executeRules();
        }
    };

    $scope.showEditEventInGrid = function(){
        var prevEvent = $scope.currentEvent || {};
        setCurrentEvent(ContextMenuSelectedItem.getSelectedItem());
        if(!$scope.notExpiredOrCanEdit()){
            NotificationService.showNotifcationDialog($translate.instant("event_expired"), $translate.instant("cannot_edit_in_grid_expired"));
            setCurrentEvent(prevEvent);
            return;
        }
        if(!$scope.currentEvent.coordinate) $scope.currentEvent.coordinate = {};
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);
        $scope.editingEventInGrid = !$scope.editingEventInGrid;
        $scope.outerForm.$valid = true;
        checkEventEditingStatus();
        $scope.executeRules("eventGridEdit");
    };

    var lastRoute = $route.current;
    $scope.$on('$locationChangeSuccess', function(event) {
        /* prevents rerouting when eventId, orgunit and category options
         * are added to the url.*/
        if ($route && $route.current && $route.current.params) {
            var newRouteParams = $route.current.params;
            if (newRouteParams.event || newRouteParams.ou || newRouteParams.options) {
                $route.current = lastRoute;
            }
        }
    });

    $scope.showEditEventInFull = function(){
        $scope.note = {};
        $scope.displayTextEffects = [];
        $scope.displayCustomForm = $scope.customDataEntryForm ? true:false;
        $scope.selectedOptionsOriginal = angular.copy($scope.selectedOptions);

        //$scope.currentEvent = ContextMenuSelectedItem.getSelectedItem();
        
        var event = ContextMenuSelectedItem.getSelectedItem();
        
        DHIS2EventFactory.get(event.event, event).then(function( event ){            
            $scope.formatEvent( event );
            setCurrentEvent(event);
            loadOptions();
            /*
              When the user goes directly to the event edit page for an event with category options,
              the $scope.dhis2Events will not be initialised since the selected category option for the event
              was not available. So we initialize it here so that the event list is visibile when the user
              clicks 'Cancel'/'Update button.
            */
            if($scope.dhis2Events || ($scope.dhis2Events.length && $scope.dhis2Events.length===0)) {
                $scope.loadEvents();
            }
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            $scope.editingEventInFull = !$scope.editingEventInFull;
            $scope.eventRegistration = false;

            angular.forEach($scope.selectedProgramStage.programStageDataElements, function(prStDe){
                if(!$scope.currentEvent.hasOwnProperty(prStDe.dataElement.id)){
                    $scope.currentEvent[prStDe.dataElement.id] = '';
                }
            }); 
            $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);

            if($scope.editingEventInFull){
                //Blank out rule effects, as there is no rules in effect before the first
                //time the rules is run on a new page.
                $rootScope.ruleeffects[$scope.currentEvent.event] = {};        
                $scope.executeRules();
            }

            if(!$location.search().ou){
                $location.search("ou",$scope.selectedOrgUnit.id);
            }
            if(!$location.search().event){
                $location.search("event",$scope.currentEvent.event);
            }
            checkEventEditingStatus();
        });
        
    };

    function checkEventEditingStatus() {
        if (!$scope.model.editingDisabled) {
            $scope.model.editingDisabled = DHIS2EventService.getEventExpiryStatus($scope.currentEvent,
                $scope.selectedProgram, $scope.selectedOrgUnit.id);

            if ($scope.model.editingDisabled) {
                var dialogOptions = {
                    headerText: $translate.instant('event_expired'),
                    bodyText: $translate.instant('editing_disabled')
                };
                DialogService.showDialog({}, dialogOptions).then(function (response) {
                });
            }
        }
    }

    $scope.notExpiredOrCanEdit = function(){
        return (!$scope.currentEventExpired || $scope.userAuthority.canEditExpiredStuff);
    }
    
    $scope.switchDataEntryForm = function(){
        $scope.displayCustomForm = !$scope.displayCustomForm;
    };    
    
    $scope.checkAndShowProgramRuleFeedback = function(editInGrid) {
        //preparing a warnings section in case it is needed by one of the other dialogs.
        var warningSection = false;
        if($scope.warningMessagesOnComplete && $scope.warningMessagesOnComplete.length > 0) {
            warningSection = {
                bodyText:'be_aware_of_validation_warnings',
                bodyList:$scope.warningMessagesOnComplete,
                itemType:'warning'
            };
        }
        
        //Prepare an error section if any errors exist:
        var errorSection = false;
        if($scope.errorMessagesOnComplete && $scope.errorMessagesOnComplete.length > 0) {
            errorSection = {
                bodyList:$scope.errorMessagesOnComplete,
                itemType:'danger'
            };
        }
        
        var def = $q.defer();
            
        if(errorSection) {
            var sections = [errorSection];
            if(warningSection) {
                sections.push(warningSection);
            }
                
            var dialogOptions = {
                headerText: 'validation_error',
                bodyText: 'please_fix_errors_before_saving',
                sections: sections
            };   
            if(editInGrid){
                def.reject(false);
                return def.promise;
            }
            DialogService.showDialog({}, dialogOptions).then(function(response) {
                def.reject(response);
            });
        } else if(warningSection) {
            if(editInGrid){
                def.resolve(true);
                return def.promise;
            }
            var modalOptions = warningSection;
            modalOptions.bodyText = 'save_despite_warnings';
            modalOptions.headerText = 'validation_warnings';
            
            ModalService.showModal({}, modalOptions).then(function() {
                def.resolve(true);
            },
            function() {
                def.reject(false);
            });
        } else {
            def.resolve(true);
        }
        
        return def.promise;
    };
    
    $scope.addEvent = function(addingAnotherEvent){
        
        //check for form validity
        $scope.outerForm.submitted = true;        
        if( $scope.outerForm.$invalid ){
            $scope.selectedSection.id = 'ALL';
            angular.forEach($scope.selectedProgramStage.programStageSections, function(section){
                section.open = true;
            });
            return false;
        }
        
        $scope.checkAndShowProgramRuleFeedback().then(function() {
            //the form is valid, get the values
            //but there could be a case where all dataelements are non-mandatory and
            //the event form comes empty, in this case enforce at least one value
            var dataValues = [];        
            for(var dataElement in $scope.prStDes){
                if($scope.prStDes.hasOwnProperty(dataElement)){
                    var val = $scope.currentEvent[dataElement];
                    val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');
                    dataValues.push({dataElement: dataElement, value: val});
                }
            }

            if(!dataValues.length || dataValues.length === 0){
                var dialogOptions = {
                    headerText: 'empty_form',
                    bodyText: 'please_fill_at_least_one_dataelement'
                };

                DialogService.showDialog({}, dialogOptions);
                return;
            }        

            $scope.model.savingRegistration = true;

            var newEvent = angular.copy($scope.currentEvent);        

            //prepare the event to be created
            var dhis2Event = {
                    program: $scope.selectedProgram.id,
                    programStage: $scope.selectedProgramStage.id,
                    orgUnit: $scope.selectedOrgUnit.id,
                    status: $scope.currentEvent.status ? 'COMPLETED' : 'ACTIVE',
                    eventDate: DateUtils.formatFromUserToApi(newEvent.eventDate),
                    dataValues: dataValues,
                    geometry: newEvent.geometry,
            }; 
            
            if( dhis2Event.status === 'COMPLETED' ){
                dhis2Event.completedDate = DateUtils.formatFromUserToApi($scope.today);
            }

            if($scope.selectedProgramStage.preGenerateUID && !angular.isUndefined(newEvent['uid'])){
                dhis2Event.event = newEvent['uid'];
            }

            if(!angular.isUndefined($scope.note.value) && $scope.note.value !== ''){
                dhis2Event.notes = [{value: $scope.note.value}];

                newEvent.notes = [{value: $scope.note.value, storedDate: $scope.today, storedBy: storedBy}];

                $scope.noteExists = true;
            }

            if($scope.selectedProgramStage.captureCoordinates){
                dhis2Event.coordinate = {latitude: $scope.currentEvent.coordinate.latitude ? $scope.currentEvent.coordinate.latitude : '',
                                         longitude: $scope.currentEvent.coordinate.longitude ? $scope.currentEvent.coordinate.longitude : ''};             
            }

            if(!$scope.selectedProgram.categoryCombo.isDefault){            
                if($scope.selectedOptions.length !== $scope.selectedCategories.length){
                    var dialogOptions = {
                        headerText: 'error',
                        bodyText: 'fill_all_category_options'
                    };

                    DialogService.showDialog({}, dialogOptions);
                    return;
                }

                //dhis2Event.attributeCc = $scope.selectedProgram.categoryCombo.id;
                dhis2Event.attributeCategoryOptions = $scope.selectedOptions.join(';');
            }

            //send the new event to server        
            DHIS2EventFactory.create(dhis2Event).then(function(data) {
                if (data.response.importSummaries[0].status === 'ERROR') {
                    var dialogOptions = {
                        headerText: 'event_registration_error',
                        bodyText: data.message
                    };

                    DialogService.showDialog({}, dialogOptions);
                }
                else {

                    //add the new event to the grid                
                    newEvent.event = data.response.importSummaries[0].reference; 
                    $scope.currentEvent.event = newEvent.event;

                    $scope.updateFileNames();

                    if( !$scope.dhis2Events ){
                        $scope.dhis2Events = [];
                        $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);                   
                    }
                    newEvent['uid'] = newEvent.event;
                    newEvent['eventDate'] = newEvent.eventDate; 
                    $scope.dhis2Events.splice(0,0,newEvent);

                    $scope.eventLength++;

                    resetView(); 

                    //reset form              
                    setCurrentEvent({});
                    setCurrentEvent(angular.copy($scope.dhis2Event));
                    $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);
                    $scope.fileNames['SINGLE_EVENT'] = {};

                    $scope.note = {};
                    $scope.displayTextEffects = [];
                    $scope.outerForm.submitted = false;
                    $scope.outerForm.$setPristine();
                    
                    //decide whether to stay in the current screen or not.
                    if(addingAnotherEvent){
                        $scope.showEventRegistration();
                        $anchorScroll();
                    }
                }
                $scope.model.savingRegistration = false;
            });
        });
    };

    function resetUrl(){
        if ($location.search().ou) {
            orgUnitFromUrl = null;
            eventIdFromUrl = null;
            //selectedOptionsFromUrl = null;
            $location.search("event",null);
            $location.search("ou", null);
        }
    }

    $scope.updateEvent = function(editInGrid){
        resetUrl();
        var def = $q.defer();
        //check for form validity
        $scope.outerForm.submitted = true;
        if( $scope.outerForm.$invalid ){
            $scope.selectedSection.id = 'ALL';
            angular.forEach($scope.selectedProgramStage.programStageSections, function(section){
                section.open = true;
            });
            def.reject();
            return def.promise;
        }
        
        return $scope.checkAndShowProgramRuleFeedback(editInGrid).then(function() {
            //the form is valid, get the values
            var dataValues = [];        
            for(var dataElement in $scope.prStDes){
                if($scope.prStDes.hasOwnProperty(dataElement)){
                    var val = $scope.currentEvent[dataElement];            
                    val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');            
                    dataValues.push({dataElement: dataElement, value: val});
                }
            }

            var updatedEvent = {
                                program: $scope.currentEvent.program,
                                programStage: $scope.currentEvent.programStage,
                                orgUnit: $scope.currentEvent.orgUnit,
                                status: $scope.currentEvent.status ? 'COMPLETED' : 'ACTIVE',
                                eventDate: DateUtils.formatFromUserToApi($scope.currentEvent.eventDate),
                                event: $scope.currentEvent.event, 
                                dataValues: dataValues,
                                geometry: $scope.currentEvent.geometry === '' ? undefined : $scope.currentEvent.geometry,
                            };

            if(!angular.isUndefined($scope.note.value) && $scope.note.value !== ''){

                updatedEvent.notes = [{value: $scope.note.value}];

                if($scope.currentEvent.notes){
                    $scope.currentEvent.notes.splice(0,0,{value: $scope.note.value, storedDate: $scope.today, storedBy: storedBy});
                }
                else{
                    $scope.currentEvent.notes = [{value: $scope.note.value, storedDate: $scope.today, storedBy: storedBy}];
                }   

                $scope.noteExists = true;
            }
            
            if( updatedEvent.status === 'COMPLETED' && $scope.currentEventOriginialValue.status !== 'COMPLETED' ){
                updatedEvent.completedDate = DateUtils.formatFromUserToApi($scope.today);
            }
            
            if( !angular.equals($scope.selectedOptionsOriginal, $scope.selectedOptions) ){
                updatedEvent.attributeCategoryOptions = $scope.selectedOptions.join(';');                        
            }

            return DHIS2EventFactory.update(updatedEvent).then(function(data){            
                //reflect the change in the gird
                $scope.outerForm.submitted = false;            
                $scope.editingEventInFull = false;
                //$scope.currentEvent = {};
                $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);                
                if( !angular.equals($scope.selectedOptionsOriginal, $scope.selectedOptions) ){
                    $scope.loadEvents(editInGrid);
                }
                else{
                    $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
                    $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
                    $scope.updateFileNames();
                }
                if(!editInGrid){
                    setCurrentEvent({});
                }
                           
            });
        }, function(){ def.reject(); return def.promise; });
    };
    
    $scope.updateEventDate = function () {
        
        $scope.updateSuccess = false;
        
        $scope.currentElement = {id: 'eventDate'};
        
        var rawDate = angular.copy($scope.currentEvent.eventDate);
        var convertedDate = DateUtils.format($scope.currentEvent.eventDate);

        if (!rawDate || !convertedDate || rawDate !== convertedDate) {
            $scope.invalidDate = true;
            $scope.currentEvent.eventDate = $scope.currentEventOriginialValue.eventDate;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            $scope.currentElement.updated = false;
            return;
        }

        //get new and old values
        var newValue = $scope.currentEvent.eventDate;   
        var oldValue = $scope.currentEventOriginialValue.eventDate;
        
        if ($scope.currentEvent.eventDate === '') {
            $scope.currentEvent.eventDate = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            $scope.currentElement.updated = false;
            return;
        }
        
        if(newValue !== oldValue){
            var e = {event: $scope.currentEvent.event,
                        orgUnit: $scope.currentEvent.orgUnit,     
                        eventDate: DateUtils.formatFromUserToApi($scope.currentEvent.eventDate)
                    };
            
            var updatedFullValueEvent = DHIS2EventService.reconstructEvent($scope.currentEvent, $scope.selectedProgramStage.programStageDataElements);

            DHIS2EventFactory.updateForEventDate(e, updatedFullValueEvent).then(function () {
                //reflect the new value in the grid
                $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
                $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
                
                //update original value
                $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);      
                
                $scope.currentElement.updated = true;
                $scope.updateSuccess = true;
            });
        }        
    };

    $scope.updateEventDataValueRadio = function(dataElement,eventToSave, value){
        eventToSave[dataElement] = value;
        return $scope.updateEventDataValue(dataElement, eventToSave);
    }

    $scope.updateEventDataValue = function(dataElement,eventToSave, backgroundUpdate){

        $scope.updateSuccess = false;
        
        //get current element
        $scope.currentElement = {id: dataElement, pending: true, updated: false, failed: false, event: eventToSave.event};
        
        //get new and old values
        var newValue = eventToSave[dataElement];        
        //var oldValue = eventToSave[dataElement];
        var oldValue = null;
        for(var i=0; i<$scope.currentStageEventsOriginal.length; i++){
            if($scope.currentStageEventsOriginal[i].event === eventToSave.event) {
                oldValue = $scope.currentStageEventsOriginal[i][dataElement];
                break;
            }
        }
        //check for form validity
        if($scope.outerForm.$invalid){
            $scope.currentElement.updated = false;
            
            //reset value back to original
            eventToSave[dataElement] = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, eventToSave);
            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            return;            
        }        
        
        if( $scope.prStDes[dataElement].compulsory && !newValue ) {
            $scope.currentElement.updated = false;                        
            
            //reset value back to original
            eventToSave[dataElement] = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, eventToSave);
            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
            return;
        }        

        if( newValue !== oldValue ){            
            newValue = CommonUtils.formatDataValue(null, newValue, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');            
            var updatedSingleValueEvent = {event: eventToSave.event, dataValues: [{value: newValue, dataElement: dataElement}]};
            var updatedFullValueEvent = DHIS2EventService.reconstructEvent(eventToSave, $scope.selectedProgramStage.programStageDataElements);

            return $scope.executeRules("eventGridEdit").then(function(){
                for(var key in $scope.mandatoryFields){
                    if($scope.mandatoryFields.hasOwnProperty(key) && $scope.prStDes[key]){
                        if(!$scope.currentEvent[key]){
                            var mandatoryDe = $scope.prStDes[key].dataElement;
                            $scope.currentElement.updated = false;
                        
                            //reset value back to original
                            eventToSave[dataElement] = oldValue;            
                            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, eventToSave);
                            $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
                            var headerText = $translate.instant('error');
                            var bodyText = 
                                $translate.instant('the_current_input_makes') 
                                +' "'+ mandatoryDe.displayName+'" '
                                + $translate.instant("a_mandatory_field_please_give") 
                                + ' "'+ mandatoryDe.displayName+'" '
                                +$translate.instant("a_value_first");

                            NotificationService.showNotifcationDialog(headerText, bodyText);
                            $scope.executeRules("eventGridEdit");
                            return;
                        }
                    }
                }

                $scope.updateEvent(true).then(function(){
                    $scope.currentElement.pending = false;
                    $scope.currentElement.updated = true;
                    $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, eventToSave);
                    $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
                    $scope.currentEventOriginialValue = angular.copy(eventToSave);
                }, function(){
                    $scope.currentElement.pending = false;
                    $scope.currentElement.updated = false;
                });

            });

            /*DHIS2EventFactory.updateForSingleValue(updatedSingleValueEvent, updatedFullValueEvent).then(function(data){
                
                //reflect the new value in the grid
                $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, eventToSave);
                $scope.currentStageEventsOriginal = angular.copy($scope.dhis2Events);
                //update original value
                $scope.currentEventOriginialValue = angular.copy(eventToSave);      
                
                $scope.currentElement.pending = false;
                $scope.currentElement.updated = true;
                $scope.updateSuccess = true;
                if(!backgroundUpdate){
                    $scope.executeRules("eventGridEdit");
                }
            }, function(){
                $scope.currentElement.pending = false;
                $scope.currentElement.updated = false;
                $scope.currentElement.failed = true;
            });*/
        }
        var def = $q.defer();
        def.resolve();
        return def.promise;
    };
    
    $scope.removeEvent = function(){
        
        var dhis2Event = ContextMenuSelectedItem.getSelectedItem();
        var modalOptions = {
            closeButtonText: 'cancel',
            actionButtonText: 'remove',
            headerText: 'remove',
            bodyText: 'are_you_sure_to_remove_with_audit'
        };

        ModalService.showModal({}, modalOptions).then(function(result){
            
            DHIS2EventFactory.delete(dhis2Event).then(function(data){

                $scope.currentFileNames = {};
                delete $scope.fileNames[$scope.currentEvent.event];
                var continueLoop = true, index = -1;
                for(var i=0; i< $scope.dhis2Events.length && continueLoop; i++){
                    if($scope.dhis2Events[i].event === dhis2Event.event ){
                        $scope.dhis2Events[i] = dhis2Event;
                        continueLoop = false;
                        index = i;
                    }
                }
                $scope.dhis2Events.splice(index,1);                
                setCurrentEvent({}); 
                $scope.fileNames['SINGLE_EVENT'] = {};
            }, function(error){

                //temporarily error message because of new audit functionality
                var dialogOptions = {
                    headerText: 'error',
                    bodyText: 'delete_error_audit'
                };
                DialogService.showDialog({}, dialogOptions);
            });
        });        
    };

    $scope.getCSVExportList = function () {
        var csvFields = ["event", "program", "programStage", "orgUnitName", "eventDate", "created", "status"];
        var selectedDataElements;
        var deferred = $q.defer();


        var dataElementUrl = $filter('filter')($scope.eventGridColumns, {group: 'DYNAMIC', show: true}).map(function(c){return c.id;});

        if( dataElementUrl && dataElementUrl.length > 0 ){
            dataElementUrl = '&dataElement=' + dataElementUrl.join(',');
        }
        else{
            dataElementUrl = '';
        }
        selectedDataElements = dataElementUrl.substr("&dataElement=".length).split(",");
        csvFields = csvFields.concat(selectedDataElements);

        DHIS2EventFactory.getByStage($scope.selectedOrgUnit.id, $scope.selectedProgramStage.id, $scope.attributeCategoryUrl,
            null, false, null, $scope.filterParam + dataElementUrl).then(function(data){
            var headerArray, headerFieldNames, headerFieldIds, eventsCSV=[], field, index, csvFieldsIndices=[], csvRow, processedData;
            if (angular.isObject(data)) {
                if (angular.isObject(data.headers)) {
                    headerArray = data.headers;
                    headerFieldIds = data.headers.map(function (object) {
                        return object.name;
                    });
                    headerFieldNames = data.headers.map(function (object) {
                        return object.column;
                    });
                    eventsCSV[0]=[];
                    for (var i = 0; i < csvFields.length; i++) {
                        field = csvFields[i];
                        index = headerFieldIds.indexOf(field);
                        if (index > -1) {
                            csvFieldsIndices.push(index);
                            eventsCSV[0].push(headerFieldNames[index]);
                        }
                    }
                }
                if (angular.isObject(data.rows)) {
                    angular.forEach(data.rows, function (rowArray) {
                        /* rowArray has one row of values for the event fields */
                        if (angular.isObject(rowArray)) {
                            csvRow = [];
                            csvFieldsIndices.forEach(function(idx) {
                                processedData = getProcessedValue(headerArray[idx].name, rowArray[idx]);
                                csvRow.push(processedData.value);
                            });
                            eventsCSV.push(csvRow);
                        }
                    });
                }
                deferred.resolve(eventsCSV);
            }

        });
        return deferred.promise;
    };

    $scope.getExportList = function (format) {
        var eventsJSON = [];

        DHIS2EventFactory.getByStage($scope.selectedOrgUnit.id, $scope.selectedProgramStage.id,
            $scope.attributeCategoryUrl, true).then(function (data) {
            var headerArray;
            var eventsXML = '<eventList>';
            var processedData;
            var dataValues;
            var eventJSON;
            if (angular.isObject(data)) {
                if (angular.isObject(data.headers)) {
                    headerArray = data.headers;
                }
                if (angular.isObject(data.rows)) {
                    angular.forEach(data.rows, function (rowArray) {
                        /* rowArray has one row of values for the event fields */
                        if (angular.isObject(rowArray)) {
                            if (format === "JSON") {
                                eventJSON = {};
                                dataValues = [];
                                headerArray.forEach(function(key, idx) {
                                    if (rowArray[idx]) {
                                        processedData =   getProcessedValue(headerArray[idx].name, rowArray[idx]);
                                        if (processedData.isDataValue) {
                                            dataValues.push({name:processedData.name, id:processedData.id, value:processedData.value})
                                        } else {
                                            eventJSON[processedData.name] = processedData.value;
                                        }
                                    }
                                });
                                if (dataValues.length > 0) {
                                    eventJSON["dataValues"] = dataValues;
                                }
                                eventsJSON.push(eventJSON);
                            } else if (format === "XML") {
                                eventsXML += "<event>";
                                dataValues = [];
                                headerArray.forEach(function(key, idx) {
                                    if (rowArray[idx]) {
                                        processedData = getProcessedValue(headerArray[idx].name, rowArray[idx]);
                                        if(processedData.isDataValue) {
                                            dataValues.push(processedData)
                                        } else {
                                            eventsXML += "<"+processedData.name+">"+processedData.value+"</"+processedData.name+">";
                                        }
                                    }
                                });
                                if(dataValues.length > 0) {
                                    eventsXML += "<dataValues>";
                                    for (var index = 0; index < dataValues.length; index++) {
                                        eventsXML += '<dataValue dataElementId="' + dataValues[index].id + '" ' +
                                            'dataElementName="' + dataValues[index].name + '" ' +
                                            'value="' + dataValues[index].value + '"/>';
                                    }
                                    eventsXML += "</dataValues>";
                                }
                                eventsXML += "</event>";
                            }
                        }
                    })
                }
            }

            if(format === "JSON") {
                saveFile(JSON.stringify({"events": eventsJSON}));
            } else if (format === "XML") {
                eventsXML += '</eventList>';
                saveFile(eventsXML);
            }
        });

        function saveFile(data) {
            var fileName = "eventList." + format.toLowerCase();// any file name with any extension
            var a = document.createElement('a');
            var blob, url;

            a.style = "display: none";
            blob = new Blob(['' + data], {type: "octet/stream", endings: 'native'});
            url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 300);
        }
    };

    function getProcessedValue(fieldName, fieldValue) {
        var processedData = {name: fieldName, value: fieldValue};
        switch (fieldName) {
            case 'program':
                processedData.value = $scope.selectedProgram && $scope.selectedProgram.name ? $scope.selectedProgram.name : fieldValue;
                break;
            case 'programStage':
                processedData.value = $scope.currentStage && $scope.currentStage.name ? $scope.currentStage.name : fieldValue;
                //alert(fieldValue);
                break;
            case 'created':
            case 'completedDate':
            case 'eventDate':
            case 'dueDate':
                processedData.value = DateUtils.formatFromApiToUser(fieldValue);
            default:
                if ($scope.prStDes[fieldName] && $scope.prStDes[fieldName].dataElement) {
                    processedData.name = $scope.prStDes[fieldName].dataElement.name;
                    processedData.value = CommonUtils.formatDataValue(null, processedData.value, $scope.prStDes[fieldName].dataElement, $scope.optionSets, 'USER');
                    processedData.value = processedData.value.toString();
                    processedData.isDataValue = true;
                    processedData.id = $scope.prStDes[fieldName].dataElement.id;
                }
        }
        return processedData;
    }




    $scope.showNotes = function(dhis2Event){
        
        var modalInstance = $modal.open({
            templateUrl: 'views/notes.html',
            controller: 'NotesController',
            resolve: {
                dhis2Event: function () {
                    return dhis2Event;
                }
            }
        });

        modalInstance.result.then(function (){
        });
    };
    
    $scope.getHelpContent = function(){
    };
    
    $scope.showAuditHistory = function(){
        
        var dhis2Event = ContextMenuSelectedItem.getSelectedItem();
        
        var modalInstance = $modal.open({
            templateUrl: './templates/audit-history.html',
            controller: 'AuditHistoryController',
            resolve: {
                eventId: function () {
                    return dhis2Event.event;
                },
                dataType: function () {
                    return 'dataElement';
                },
                nameIdMap: function () {
                    return $scope.prStDes;
                },
                optionSets: function(){
                    return $scope.optionSets;
                }
            }
        });

        modalInstance.result.then(function () {            
        },function(){
        });
        
    };

    $scope.formIsChanged = function(){        
        var isChanged = false;
        var emptyForm = $scope.formIsEmpty();
        for(var i=0; i<$scope.selectedProgramStage.programStageDataElements.length && !isChanged; i++){
            var deId = $scope.selectedProgramStage.programStageDataElements[i].dataElement.id;
            if($scope.currentEventOriginialValue[deId] !== $scope.currentEvent[deId]){
                if($scope.currentEvent[deId] || $scope.currentEventOriginialValue[deId] !== "" && !emptyForm){                    
                    isChanged = true; 
                }                               
            }
        }        
        if(!isChanged){
            if(($scope.currentEvent.eventDate !== $scope.currentEventOriginialValue.eventDate) ||
                $scope.currentEvent.status !== $scope.currentEventOriginialValue.status){
                isChanged = true;
            }
        }
        
        return isChanged;
    };
    
    $scope.isFormInvalid = function(){
        if($scope.outerForm.submitted){
            return $scope.outerForm.$invalid;
        }

        if($scope.model.invalidDate) {
            return true;
        }
        
        if(!$scope.outerForm.$dirty){
            return false;
        }
        
        var formIsInvalid = false;
        for(var k in $scope.outerForm.$error){            
            if(angular.isObject($scope.outerForm.$error[k])){
                
                for(var i=0; i<$scope.outerForm.$error[k].length && !formIsInvalid; i++){
                    if($scope.outerForm.$error[k][i].$dirty && $scope.outerForm.$error[k][i].$invalid){
                        formIsInvalid = true;
                    }
                }
            }
            
            if(formIsInvalid){
                break;
            }
        }
        
        return formIsInvalid;
    };
    
    $scope.formIsEmpty = function(){
        for(var dataElement in $scope.prStDes){
            if($scope.currentEvent[dataElement]){
                return false;
            }
        }
        return true;
    };
    
    //watch for event editing
    $scope.$watchCollection('[editingEventInFull, eventRegistration]', function() {        
        if($scope.editingEventInFull || $scope.eventRegistration){
            //Disable ou selection while in editing mode
            $( "#orgUnitTree" ).addClass( "disable-clicks" );
        }
        else{
            //enable ou selection if not in editing mode
            $( "#orgUnitTree" ).removeClass( "disable-clicks" );
        }
    });
    
    $scope.interacted = function(field) {
        var status = false;
        if(field){            
            status = $scope.outerForm.submitted || field.$dirty;
        }
        return status;
    };

    //listen for rule effect changes    
    var ruleEffectsUpdated = function(result) {
        $scope.warningMessages = [];
        $scope.warningMessagesOnComplete = [];
        $scope.errorMessagesOnComplete = [];
        $scope.hiddenSections = [];
        $scope.hiddenFields = [];
        $scope.assignedFields = [];
        $scope.mandatoryFields = [];
        $scope.displayTextEffects = [];
        $scope.optionVisibility = {};

        var isGridEdit = result.callerId === "eventGridEdit";
        var dataElementOptionsChanged = [];
        if($rootScope.ruleeffects[result.event]) {
            //Establish which event was affected:
            var affectedEvent = $scope.currentEvent;
            //In most cases the updated effects apply to the current event. In case the affected event is not the current event, fetch the correct event to affect:
            if(result.event !== affectedEvent.event) {
                angular.forEach($scope.currentStageEvents, function(searchedEvent) {
                    if(searchedEvent.event === result.event) {
                        affectedEvent = searchedEvent;
                    }
                });
            }
            angular.forEach($rootScope.ruleeffects[result.event], function(effect) {
                
                if(effect.ineffect) {
                    //in the data entry controller we only care about the "hidefield" actions
                    if(effect.action === "HIDEFIELD") {
                        if(effect.dataElement) {
                            if(affectedEvent[effect.dataElement.id]) {
                                //If a field is going to be hidden, but contains a value, we need to take action;
                                if(effect.content) {
                                    //TODO: Alerts is going to be replaced with a proper display mecanism.
                                    alert(effect.content);
                                }
                                else {
                                    //TODO: Alerts is going to be replaced with a proper display mecanism.
                                    alert($scope.prStDes[effect.dataElement.id].dataElement.displayFormName + " was blanked out and hidden by your last action");
                                }

                                //Blank out the value:
                                affectedEvent[effect.dataElement.id] = "";
                            }

                            $scope.hiddenFields[effect.dataElement.id] = effect.ineffect;
                        }
                        else {
                            $log.warn("ProgramRuleAction " + effect.id + " is of type HIDEFIELD, bot does not have a dataelement defined");
                        }
                    }
                    else if(effect.action === "HIDESECTION") {
                        if(effect.programStageSection){
                            $scope.hiddenSections[effect.programStageSection] = effect.programStageSection;
                        }
                    }
                    else if(effect.action === "SHOWERROR" 
                            || effect.action === "ERRORONCOMPLETE" ){
                        
                        var message = effect.content + (effect.data ? effect.data : "");
                        
                        if(effect.dataElement && effect.dataElement.id && effect.action==="SHOWERROR") {
                            message = $scope.prStDes[effect.dataElement.id].dataElement.displayFormName
                            + ": " + message;
                            $scope.currentEvent[effect.dataElement.id] = $scope.currentEventOriginialValue[effect.dataElement.id];
                            var dialogOptions = {
                                headerText: 'validation_error',
                                bodyText: message
                            };
                            DialogService.showDialog({}, dialogOptions);
                        }
                        
                        $scope.errorMessagesOnComplete.push(message);
                    }
                    else if(effect.action === "SHOWWARNING" 
                            || effect.action === "WARNINGONCOMPLETE"){
                        if(effect.action === "SHOWWARNING") {
                            if(effect.dataElement && $scope.hiddenFields[effect.dataElement.id]) {
                                console.log("Warning (" + effect.id + ") hidden because, data element (" + effect.dataElement.id + ") is hidden by program rule.");
                            } else {
                                $scope.warningMessages.push(effect.content + (effect.data ? effect.data : ""));
                            }
                        }
                        $scope.warningMessagesOnComplete.push(effect.content + (effect.data ? effect.data : ""));
                    }
                    else if(effect.action === "ASSIGN") {
                        var data = $filter('trimquotes')(effect.data);
                        var processedValue = CommonUtils.formatDataValue(null, data, $scope.prStDes[effect.dataElement.id].dataElement, $scope.optionSets, 'USER');
                        
                        //For "ASSIGN" actions where we have a dataelement, we save the calculated value to the dataelement:
                        if($scope.prStDes[effect.dataElement.id].dataElement.optionSet) {
                            processedValue = OptionSetService.getName(
                                $scope.optionSets[$scope.prStDes[effect.dataElement.id].dataElement.optionSet.id].options, processedValue);
                        }  
                        processedValue = processedValue === "true" ? true : processedValue;
                        processedValue = processedValue === "false" ? false : processedValue;

                        affectedEvent[effect.dataElement.id] = processedValue;
                        $scope.assignedFields[effect.dataElement.id] = true;
                        //if(isGridEdit) $scope.updateEventDataValue(effect.dataElement.id, affectedEvent, true);
                    }
                    else if(effect.action === "DISPLAYKEYVALUEPAIR") {
                        $scope.displayTextEffects.push({name:effect.content,text:effect.data});
                    }
                    else if(effect.action === "DISPLAYTEXT") {
                        $scope.displayTextEffects.push({text:effect.data + effect.content});
                    }
                    else if(effect.action === "SETMANDATORYFIELD"){
                        $scope.mandatoryFields[effect.dataElement.id] = effect.ineffect;
                    }
                    else if(effect.action === "HIDEOPTION"){
                        if(effect.ineffect && effect.dataElement && effect.option){
                            if(!$scope.optionVisibility[effect.dataElement.id]) $scope.optionVisibility[effect.dataElement.id] = { hidden: {}};
                            if(!$scope.optionVisibility[effect.dataElement.id].hidden) $scope.optionVisibility[effect.dataElement.id].hidden = {};
                            $scope.optionVisibility[effect.dataElement.id].hidden[effect.option.id] = effect.ineffect;
                            if(dataElementOptionsChanged.indexOf(effect.dataElement.id) === -1) dataElementOptionsChanged.push(effect.dataElement.id);
                        }
                    }
                    else if(effect.action === "HIDEOPTIONGROUP"){
                        if(effect.ineffect && effect.dataElement && effect.optionGroup){
                            if(!$scope.optionVisibility[effect.dataElement.id]) $scope.optionVisibility[effect.dataElement.id] = { hidden: {}};
                            var optionGroup = $scope.optionGroupsById[effect.optionGroup.id];
                            if(optionGroup){
                                angular.extend($scope.optionVisibility[effect.dataElement.id].hidden, optionGroup.optionsById);
                                if(dataElementOptionsChanged.indexOf(effect.dataElement.id) === -1) dataElementOptionsChanged.push(effect.dataElement.id);
                            }else{
                                $log.warn("OptionGroup "+effect.optionGroup.id+" was not found");
                            }
        
                        }
                    }
                    else if(effect.action === "SHOWOPTIONGROUP"){
                        if(effect.ineffect && effect.dataElement && effect.optionGroup){
                            if(!$scope.optionVisibility[effect.dataElement.id]) $scope.optionVisibility[effect.dataElement.id] = { hidden: {}};
                            var optionGroup = $scope.optionGroupsById[effect.optionGroup.id];
                            if(optionGroup){
                                if(!$scope.optionVisibility[effect.dataElement.id].showOnly) $scope.optionVisibility[effect.dataElement.id].showOnly = {};
                                angular.extend($scope.optionVisibility[effect.dataElement.id].showOnly, optionGroup.optionsById);
                                if(dataElementOptionsChanged.indexOf(effect.dataElement.id) === -1) dataElementOptionsChanged.push(effect.dataElement.id);
                            }else{
                                $log.warn("OptionGroup "+effect.optionGroup.id+" was not found");
                            }

                        }
                    }
                }
            });
            clearDataElementValueForShowHideOptionActions(dataElementOptionsChanged, affectedEvent);
        }
    };

    var clearDataElementValueForShowHideOptionActions = function(dataElements, affectedEvent){
        dataElements.forEach(function(de) {
            var value = affectedEvent[de];
            //Only process if has selected value
            if(angular.isDefined(value) && value !== "") {
                var optionSet = $scope.optionSets[$scope.prStDes[de].dataElement.optionSet.id];
                //Find selectedOption by displayName
                var selectedOption = optionSet.options.find(function(o) { return o.displayName === value });
                var shouldClear = !selectedOption;
                
                //If has selected option and a option is not in showOnly or is in hidden, field should be cleared.
                if(selectedOption){
                    shouldClear = ($scope.optionVisibility[de].showOnly && !$scope.optionVisibility[de].showOnly[selectedOption.id]) || $scope.optionVisibility[de].hidden[selectedOption.id];
                }
    
                if(shouldClear){
                    var message = ($scope.prStDes[de].dataElement.displayName + ' was blanked out because the option "'+value+'" got hidden by your last action');
                    alert(message);
                    affectedEvent[de] = "";
                }
            }
        });
    }
    
    $scope.executeRules = function(callerId) {
        $scope.currentEvent.event = !$scope.currentEvent.event ? 'SINGLE_EVENT' : $scope.currentEvent.event;
        var flags = {debug: true, verbose: $location.search().verbose ? true : false, callerId: callerId};
        return TrackerRulesExecutionService.loadAndExecuteRulesScope($scope.currentEvent,$scope.selectedProgram.id,$scope.selectedProgramStage.id,$scope.prStDes,null,$scope.optionSets,$scope.selectedOrgUnit.id,flags).then(function(result)
        {
            ruleEffectsUpdated(result);
        });
    };
       
    
    $scope.formatNumberResult = function(val){        
        return dhis2.validation.isNumber(val) ? new Number(val) : '';
    };
    
    $scope.toTwoDecimals = function(val){        
        //Round data to two decimals if it is a number:
        if(dhis2.validation.isNumber(val)){
            val = Math.round(val*100)/100;
        }
        
        return val;
    };
    
    //check if field is hidden
    $scope.isHidden = function(id) {
        //In case the field contains a value, we cant hide it. 
        //If we hid a field with a value, it would falsely seem the user was aware that the value was entered in the UI.
        if($scope.currentEvent[id]) {
           return false; 
        }
        else {
            return $scope.hiddenFields[id];
        }
    };
    
    $scope.saveDatavalue = function(){
        $scope.executeRules();
    };

    $scope.saveDatavalueRadio = function(prStDe, event, value){
        var id = prStDe.dataElement ? prStDe.dataElement.id : prStDe.id;
        event[id] = value;
        $scope.executeRules();
    };

    $scope.updateDatavalueRadio = function(prStDe, event, value){
        var id = prStDe.dataElement ? prStDe.dataElement.id : prStDe.id;
        event[id] = value;
        $scope.updateEventDataValue(id);
    }

   $scope.saveCurrentEventStatus = function(status) {
       $scope.currentEvent.status = status;
   };
    
    $scope.getInputNotifcationClass = function(id, custom){
        if($scope.currentElement.id && $scope.currentElement.id === id){
            if($scope.currentElement.pending){
                if(custom){
                    return 'input-pending';
                }
                return 'form-control input-pending';
            }
            if($scope.currentElement.updated){
                if(custom){
                    return 'input-success';
                }
                return 'form-control input-success';
            }          
            if($scope.currentElement.failed){
                if(custom){
                    return 'input-error';
                }
                return 'form-control input-error';
            }            
        }  
        if(custom){
            return '';
        }
        return 'form-control';
    };
    
    $scope.getClickFunction = function(dhis2Event, column){
        
        if(column.id === 'comment'){
            return "showNotes(" + dhis2Event + ")"; 
        }
        else{
            if(dhis2Event.event ===$scope.currentEvent.event){
                return '';
            }
            else{
                return "showEventList(" + dhis2Event + ")"; 
            }
        }        
        return '';        
    };
    
    $scope.downloadFile = function(eventUid, dataElementUid, e) {
        eventUid = eventUid ? eventUid : $scope.currentEvent.event ? $scope.currentEvent.event : null;        
        if( !eventUid || !dataElementUid){
            
            var dialogOptions = {
                headerText: 'error',
                bodyText: 'missing_file_identifier'
            };

            DialogService.showDialog({}, dialogOptions);
            return;
        }
        
        $window.open(DHIS2URL + '/events/files?eventUid=' + eventUid +'&dataElementUid=' + dataElementUid, '_blank', '');
        if(e){
            e.stopPropagation();
            e.preventDefault();
        }
    };
    
    $scope.deleteFileFromGrid = function(event, dataElement){
        if( !dataElement ){            
            var dialogOptions = {
                headerText: 'error',
                bodyText: 'missing_file_identifier'
            };
            DialogService.showDialog({}, dialogOptions);
            return;
        }
        
        var modalOptions = {
            closeButtonText: 'cancel',
            actionButtonText: 'remove',
            headerText: 'remove',
            bodyText: 'are_you_sure_to_remove'
        };

        ModalService.showModal({}, modalOptions).then(function(result){
            delete $scope.fileNames[$scope.currentEvent.event][dataElement];
            $scope.currentEvent[dataElement] = null;
            $scope.updateEventDataValue(dataElement, $scope.currentEvent);
        });
    };

    $scope.deleteFile = function(event, dataElement){
        if( !dataElement ){            
            var dialogOptions = {
                headerText: 'error',
                bodyText: 'missing_file_identifier'
            };
            DialogService.showDialog({}, dialogOptions);
            return;
        }
        
        var modalOptions = {
            closeButtonText: 'cancel',
            actionButtonText: 'remove',
            headerText: 'remove',
            bodyText: 'are_you_sure_to_remove'
        };

        ModalService.showModal({}, modalOptions).then(function(result){
            delete $scope.fileNames[$scope.currentEvent.event][dataElement];
            $scope.currentEvent[dataElement] = null;
            $scope.executeRules();
        });
    };
    
    $scope.updateFileNames = function(){        
        for(var dataElement in $scope.currentFileNames){
            if($scope.currentFileNames[dataElement]){
                if(!$scope.fileNames[$scope.currentEvent.event]){
                    $scope.fileNames[$scope.currentEvent.event] = {};
                }                 
                $scope.fileNames[$scope.currentEvent.event][dataElement] = $scope.currentFileNames[dataElement];
            }
        }
    };
    
    $scope.filterTextExist = function(){        
        return angular.equals($scope.filterText, $scope.emptyFilterText);
    };

    $scope.hasDataWrite = function(){
        return $scope.selectedProgram && $scope.selectedProgram.access && $scope.selectedProgram.access.data.write;
    }
    
    $scope.accessFilter = function(categoryOption){
        return categoryOption.access && categoryOption.access.read;
    }
})

.controller('NotesController', function($scope, $modalInstance, dhis2Event){

    $scope.dhis2Event = dhis2Event;

    $scope.close = function () {
        $modalInstance.close();
    };
});