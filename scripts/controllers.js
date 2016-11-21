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
                $filter,
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
                FileService,
                AuthorityService,
                TrackerRulesExecutionService,
                OrgUnitFactory,
                OptionSetService) {
    
    $scope.maxOptionSize = 30;
    //selected org unit
    //$scope.selectedOrgUnit = '';
    $scope.treeLoaded = false;    
    $scope.selectedSection = {id: 'ALL'};    
    $rootScope.ruleeffects = {};
    $scope.hiddenFields = [];
    $scope.assignedFields = [];
    
    $scope.calendarSetting = CalendarService.getSetting();
    
    //Paging
    $scope.pager = {pageSize: 50, page: 1, toolBarDisplay: 5};   
    
    //Editing
    $scope.eventRegistration = false;
    $scope.editGridColumns = false;
    $scope.editingEventInFull = false;
    $scope.editingEventInGrid = false;   
    $scope.updateSuccess = false;
    $scope.currentGridColumnId = '';  
    $scope.dhis2Events = [];
    $scope.currentEvent = {};
    $scope.currentEventOriginialValue = {}; 
    $scope.displayCustomForm = false;
    $scope.currentElement = {id: '', update: false};
    $scope.optionSets = [];
    $scope.proceedSelection = true;
    $scope.formUnsaved = false;
    $scope.fileNames = {};
    $scope.currentFileNames = {};
    $scope.model = {exportFormats:["XML","JSON","CSV"], savingRegistration: false};
    
    //notes
    $scope.note = {};
    $scope.displayTextEffects = [];
    $scope.today = DateUtils.getToday();    
    
    var userProfile = SessionStorageService.get('USER_PROFILE');
    var storedBy = userProfile && userProfile.username ? userProfile.username : '';
    
    $scope.noteExists = false;

    var orgUnitFromUrl = ($location.search()).ou;

    var eventIdFromUrl = ($location.search()).event;

    var selectedOptionsFromUrl = ($location.search()).options;

    if (selectedOptionsFromUrl) {
        selectedOptionsFromUrl = selectedOptionsFromUrl.split(";");
    }
    //watch for selection of org unit from tree
    $scope.$watch('selectedOrgUnit', function() {
        if (angular.isObject($scope.selectedOrgUnit)) {
            if (orgUnitFromUrl) {
                OrgUnitFactory.get(orgUnitFromUrl).then(function (orgUnit) {
                    $scope.selectedOrgUnit = orgUnit;
                });
                selection.select(orgUnitFromUrl);
                subtree.reloadTree();
                orgUnitFromUrl = null;
                $location.search("ou", null);
                return;
            }

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

            $scope.userAuthority = AuthorityService.getUserAuthorities(SessionStorageService.get('USER_ROLES'));
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
            })
        }
    });

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
        $scope.currentEvent = {};
        $scope.currentEventOriginialValue = {};
        $scope.fileNames = {};
        $scope.currentFileNames = {};

        $scope.eventRegistration = false;
        $scope.editGridColumns = false;
        $scope.editingEventInFull = false;
        $scope.editingEventInGrid = false;   
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
                    $scope.getProgramDetails();
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
                        $scope.getProgramDetails();
                        var programStages = $scope.selectedProgram.programStages;
                        for (var j = 0; j < programStages.length; j++) {
                            if (programStages[j].id === event.programStage) {
                                $scope.formatEvent(event);
                                $scope.currentEvent = angular.copy(event);
                                $scope.editingEventInFull = false;
                                $scope.showEditEventInFull();
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        });
    };

    $scope.formatEvent = function(event) {
        if(event.notes && event.notes.length > 0 && !$scope.noteExists){
            $scope.noteExists = true;
        }

        angular.forEach(event.dataValues, function(dataValue){
            if($scope.prStDes && $scope.prStDes[dataValue.dataElement]){
                var val = dataValue.value;
                if(angular.isObject($scope.prStDes[dataValue.dataElement].dataElement)){
                    val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataValue.dataElement].dataElement, $scope.optionSets, 'USER');
                }

                event[dataValue.dataElement] = val;

                if($scope.prStDes[dataValue.dataElement].dataElement.valueType === 'FILE_RESOURCE'){
                    FileService.get(val).then(function(response){
                        if(response && response.displayName){
                            if(!$scope.fileNames[event.event]){
                                $scope.fileNames[event.event] = {};
                            }
                            $scope.fileNames[event.event][dataValue.dataElement] = response.displayName;
                        }
                    });
                }
            }
        });

        event['uid'] = event.event;
        event.eventDate = DateUtils.formatFromApiToUser(event.eventDate);
        event['eventDate'] = event.eventDate;
        if (event['completedDate']) {
            event['completedDate'] = DateUtils.formatFromApiToUser(event['completedDate']);
        }
        if(event.status === "ACTIVE") {
            event.status = false;
        } else if(event.status === "COMPLETED") {
            event.status = true;
        }
        delete event.dataValues;
    };



    /* If gridCoulumns for a program is stored in user data store then it is restored when
     * the program is selected. If the grid columns are not stored then the grid columns are set
     * as the default one for that program (in $scope.search() function)
     * */
    $scope.restoreGridColumnsFromUserStore = function() {
        $scope.eventGridColumnsRestored = false;
        if($scope.gridColumnsInUserStore && $scope.selectedProgram && $scope.selectedProgram.id) {
            if ($scope.gridColumnsInUserStore[$scope.selectedProgram.id]) {
                $scope.eventGridColumns = angular.copy($scope.gridColumnsInUserStore[$scope.selectedProgram.id]);
                $scope.eventGridColumnsRestored = true;
            }
        }
        if (!$scope.eventGridColumnsRestored) {
            $scope.eventGridColumns = [];   
        }
    };

    $scope.getProgramDetails = function(){

        $scope.selectedOptions = [];
        $scope.selectedProgramStage = null;
        $scope.eventFetched = false;
        $scope.optionsReady = false;
        
        //Filtering
        $scope.reverse = false;
        $scope.sortHeader = {};
        $scope.filterText = {};
        $scope.filterParam = '';
        
        if( $scope.userAuthority && $scope.userAuthority.canAddOrUpdateEvent &&
                $scope.selectedProgram && 
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
                if(!$scope.eventGridColumnsRestored) {
                    $scope.eventGridColumns.push({
                    displayName: 'event_uid',
                    id: 'uid',
                    valueType: 'TEXT',
                    compulsory: false,
                    filterWithRange: false,
                    showFilter: false,
                    show: false
                    });
                }
                $scope.filterTypes['uid'] = 'TEXT';

                if(!$scope.eventGridColumnsRestored) {
                    $scope.eventGridColumns.push({
                        displayName: $scope.selectedProgramStage.reportDateDescription ? $scope.selectedProgramStage.reportDateDescription : $translate.instant('incident_date'),
                        id: 'eventDate',
                        valueType: 'DATE',
                        filterWithRange: true,
                        compulsory: false,
                        showFilter: false,
                        show: true
                    });
                }
                $scope.filterTypes['eventDate'] = 'DATE';
                $scope.filterText['eventDate']= {};

                angular.forEach($scope.selectedProgramStage.programStageDataElements, function(prStDe){
                    
                    $scope.prStDes[prStDe.dataElement.id] = prStDe;
                    $scope.newDhis2Event[prStDe.dataElement.id] = '';
                   
                    if(!$scope.eventGridColumnsRestored) {
                        //generate grid headers using program stage data elements
                        //create a template for new event
                        //for date type dataelements, filtering is based on start and end dates
                        $scope.eventGridColumns.push({displayName: prStDe.dataElement.displayFormName,
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
                                                  show: prStDe.displayInReports});
                    }

                    $scope.filterTypes[prStDe.dataElement.id] = prStDe.dataElement.valueType;

                    if(prStDe.dataElement.valueType === 'DATE' ||
                            prStDe.dataElement.valueType === 'NUMBER' ||
                            prStDe.dataElement.valueType === 'INTEGER' ||
                            prStDe.dataElement.valueType === 'INTEGER_POSITIVE' ||
                            prStDe.dataElement.valueType === 'INTEGER_NEGATIVE' ||
                            prStDe.dataElement.valueType === 'INTEGER_ZERO_OR_POSITIVE'){
                        $scope.filterText[prStDe.dataElement.id]= {};
                    }
                });
                
                $scope.customDataEntryForm = CustomFormService.getForProgramStage($scope.selectedProgramStage, $scope.prStDes);

                if($scope.selectedProgramStage.captureCoordinates){
                    $scope.newDhis2Event.coordinate = {};
                }
                
                $scope.newDhis2Event.eventDate = '';
                $scope.newDhis2Event.event = 'SINGLE_EVENT';
                
                $scope.selectedCategories = [];
                if($scope.selectedProgram.categoryCombo && !$scope.selectedProgram.categoryCombo.isDefault && $scope.selectedProgram.categoryCombo.categories){
                    $scope.selectedCategories = $scope.selectedProgram.categoryCombo.categories;
                    $scope.getCategoryOptions();
                }
                else{
                    $scope.optionsReady = true;
                    $scope.loadEvents();
                }  
        }
    };
    
    $scope.getCategoryOptions = function(){
        $scope.eventFetched = false;
        $scope.optionsReady = false;
        $scope.selectedOptions = [];
        var categoryOptions = null;

        if (selectedOptionsFromUrl) {
            $scope.selectedOptions = selectedOptionsFromUrl;
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
        } else {
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
        }
        if($scope.optionsReady){
            $scope.loadEvents();
        }
    };
        
    //get events for the selected program (and org unit)
    $scope.loadEvents = function(){
        
        $scope.noteExists = false;            
        $scope.dhis2Events = [];
        $scope.eventLength = 0;
        $scope.eventFetched = false;
        
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
            DHIS2EventFactory.getByStage($scope.selectedOrgUnit.id, $scope.selectedProgramStage.id, $scope.attributeCategoryUrl, $scope.pager, true, null, $scope.filterParam ).then(function(data){

                if(data.events){
                    $scope.eventLength = data.events.length;
                }                

                //$scope.dhis2Events = data.events; 

                if( data.pager ){
                    data.pager.pageSize = data.pager.pageSize ? data.pager.pageSize : $scope.pager.pageSize;
                    $scope.pager = data.pager;
                    $scope.pager.toolBarDisplay = 5;

                    Paginator.setPage($scope.pager.page);
                    Paginator.setPageCount($scope.pager.pageCount);
                    Paginator.setPageSize($scope.pager.pageSize);
                    Paginator.setItemCount($scope.pager.total);                    
                }

                //process event list for easier tabular sorting
                if( angular.isObject( data.events ) ) {

                    angular.forEach(data.events,function(event){
                        $scope.formatEvent(event);
                    });

                    $scope.dhis2Events = data.events; 
                    
                    if($scope.noteExists && !GridColumnService.columnExists($scope.eventGridColumns, 'comment')){
                        $scope.eventGridColumns.push({displayName: 'comment', id: 'comment', type: 'TEXT', filterWithRange: false, compulsory: false, showFilter: false, show: true});
                    }
                    
                    if(!$scope.sortHeader.id){
                        $scope.sortEventGrid({displayName: $scope.selectedProgramStage.reportDateDescription ? $scope.selectedProgramStage.reportDateDescription : 'incident_date', id: 'eventDate', type: 'DATE', compulsory: false, showFilter: false, show: true});
                    }
                }
                
                $scope.eventFetched = true;
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
            return;
        }        
        $scope.sortHeader = gridHeader;
        if($scope.sortHeader.type === 'DATE'){
            $scope.reverse = true;
        }
        else{
            $scope.reverse = false;    
        }        
    };
    
    $scope.d2Sort = function(dhis2Event){        
        if($scope.sortHeader && $scope.sortHeader.type === 'DATE'){            
            var d = dhis2Event[$scope.sortHeader.id];         
            return DateUtils.getDate(d);
        }
        return dhis2Event[$scope.sortHeader.id];
    };
    
    $scope.showHideColumns = function(){
        
        $scope.hiddenGridColumns = 0;
        var currentColumns = angular.copy($scope.eventGridColumns);
        
        angular.forEach($scope.eventGridColumns, function(eventGridColumn){
            if(!eventGridColumn.show){
                $scope.hiddenGridColumns++;
            }
        });
        
        var modalInstance = $modal.open({
            templateUrl: 'views/column-modal.html',
            controller: 'ColumnDisplayController',
            resolve: {
                gridColumns: function () {
                    return $scope.eventGridColumns;
                },
                hiddenGridColumns: function(){
                    return $scope.hiddenGridColumns;
                },
                saveGridColumns: function () {
                    return function (gridColumns) {
                        if (!checkIfGridColumnsChanged(gridColumns)) {
                            return;
                        }
                        $scope.eventGridColumns = gridColumns;

                        if (!$scope.gridColumnsInUserStore || ($scope.gridColumnsInUserStore && $scope.gridColumnsInUserStore.length===0)) {
                            $scope.gridColumnsInUserStore = {};
                        }
                        $scope.gridColumnsInUserStore[$scope.selectedProgram.id] = angular.copy($scope.eventGridColumns);
                        GridColumnService.set($scope.gridColumnsInUserStore, "eventCaptureGridColumns");
                    }
                }
            }
        });

        modalInstance.result.then(function (gridColumns) {


        }, function () {
        });

        function checkIfGridColumnsChanged(gridColumns) {
            for (var i = 0; i<gridColumns.length; i++) {
                if (currentColumns[i].show !== gridColumns[i].show) {
                    return true;
                }
            }
            return false;
        }
    };
    
    $scope.filterEvents = function(gridColumn, applyFilter){        
        $scope.filterParam = '';       
        for(var i=0; i<$scope.eventGridColumns.length; i++){
            //toggle the selected grid column's filter
            if($scope.eventGridColumns[i].id === gridColumn.id){
                $scope.eventGridColumns[i].showFilter = !$scope.eventGridColumns[i].showFilter;
            }            
            else{
                $scope.eventGridColumns[i].showFilter = false;
            }
            
            /*if( applyFilter ){
                if( $scope.filterText[$scope.eventGridColumns[i].id] && $scope.filterText[$scope.eventGridColumns[i].id] !== ''){                
                    if( angular.isObject( $scope.filterText[$scope.eventGridColumns[i].id] ) ) {                    
                        if( $scope.filterText[$scope.eventGridColumns[i].id].start || $scope.filterText[$scope.eventGridColumns[i].id].end ){
                            $scope.filterParam += '&filter=' + $scope.eventGridColumns[i].id;                     
                            if( $scope.filterText[$scope.eventGridColumns[i].id].start ){
                                $scope.filterParam += ':GT:' + $scope.filterText[$scope.eventGridColumns[i].id].start;
                            }                    
                            if( $scope.filterText[$scope.eventGridColumns[i].id].end ){
                                $scope.filterParam += ':LT:' + $scope.filterText[$scope.eventGridColumns[i].id].end;
                            }
                        }                                        
                    }
                    else{                    
                        $scope.filterParam += '&filter=' + $scope.eventGridColumns[i].id + ':like:' + $scope.filterText[$scope.eventGridColumns[i].id];
                    }
                }
            }*/            
        }
        
        /*if( applyFilter && $scope.filterParam !== '' ){
            $scope.loadEvents();
        }*/       
    };
    
    $scope.removeStartFilterText = function(gridColumnId){
        $scope.filterText[gridColumnId].start = undefined;
    };
    
    $scope.removeEndFilterText = function(gridColumnId){
        $scope.filterText[gridColumnId].end = undefined;
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
                $scope.showEventList();
            });
        }
        else{
            $scope.showEventList();
        }
        $scope.model.editingDisabled = false;
    };
    
    $scope.showEventList = function(dhis2Event){        
        ContextMenuSelectedItem.setSelectedItem(dhis2Event);
        $scope.eventRegistration = false;
        $scope.editingEventInFull = false;
        $scope.editingEventInGrid = false;
        $scope.currentElement.updated = false;        
        $scope.currentEvent = {};
        $scope.fileNames['SINGLE_EVENT'] = {};
        $scope.currentElement = {};
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);
    };
    
    $scope.showEventRegistration = function(){        
        $scope.displayCustomForm = $scope.customDataEntryForm ? true : false;
        $scope.currentEvent = {};
        $scope.fileNames['SINGLE_EVENT'] = {};
        $scope.currentFileNames = {};
        $scope.eventRegistration = !$scope.eventRegistration;          
        $scope.currentEvent = angular.copy($scope.newDhis2Event);        
        $scope.outerForm.submitted = false;
        $scope.note = {};
        $scope.displayTextEffects = [];
        
        if($scope.selectedProgramStage.preGenerateUID){
            $scope.eventUID = dhis2.util.uid();
            $scope.currentEvent['uid'] = $scope.eventUID;
        }        
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent); 
        
        if($scope.eventRegistration){
            $scope.executeRules();
        }
    };

    $scope.showEditEventInGrid = function(){
        $scope.currentEvent = ContextMenuSelectedItem.getSelectedItem();
        $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);
        $scope.editingEventInGrid = !$scope.editingEventInGrid;

        $scope.outerForm.$valid = true;
        checkEventEditingStatus();
    };

    var lastRoute = $route.current;
    $scope.$on('$locationChangeSuccess', function(event) {
        /* prevents rerouting when eventId, orgunit and category options
         * are added to the url.*/
        if ($route && $route.current && $route.current.params) {
            var newRouteParams = $route.current.params
            if (newRouteParams.event || newRouteParams.ou || newRouteParams.options) {
                $route.current = lastRoute;
            }
        }
    });

    $scope.showEditEventInFull = function(){
        $scope.note = {};
        $scope.displayTextEffects = [];
        $scope.displayCustomForm = $scope.customDataEntryForm ? true:false;

        $scope.currentEvent = ContextMenuSelectedItem.getSelectedItem();
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
        if(!$location.search().options && $scope.optionsReady && $scope.selectedOptions.length>0){
            $location.search("options",$scope.selectedOptions.join(";"));
        }
        checkEventEditingStatus();
    };

    function checkEventEditingStatus() {
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
    
    $scope.switchDataEntryForm = function(){
        $scope.displayCustomForm = !$scope.displayCustomForm;
    };    
    
    $scope.checkAndShowProgramRuleFeedback = function() {
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
            
            DialogService.showDialog({}, dialogOptions).then(function(response) {
                def.reject(response);
            });
        } else if(warningSection) {
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
            var valueExists = false;
            var dataValues = [];        
            for(var dataElement in $scope.prStDes){            
                var val = $scope.currentEvent[dataElement];
                if(val){
                    valueExists = true;                
                    val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');
                }
                dataValues.push({dataElement: dataElement, value: val});
            }

            if(!valueExists){
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
                    dataValues: dataValues
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
                    }
                    newEvent['uid'] = newEvent.event;
                    newEvent['eventDate'] = newEvent.eventDate; 
                    $scope.dhis2Events.splice(0,0,newEvent);

                    $scope.eventLength++;

                    $scope.eventRegistration = false;
                    $scope.editingEventInFull = false;
                    $scope.editingEventInGrid = false;  

                    //reset form              
                    $scope.currentEvent = {};
                    $scope.currentEvent = angular.copy($scope.newDhis2Event); 
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
            selectedOptionsFromUrl = null;
            $location.search("event",null);
            $location.search("ou", null);
        }
    }

    $scope.updateEvent = function(){
       resetUrl();
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
            var dataValues = [];        
            for(var dataElement in $scope.prStDes){
                var val = $scope.currentEvent[dataElement];            
                val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');            
                dataValues.push({dataElement: dataElement, value: val});
            }

            var updatedEvent = {
                                program: $scope.currentEvent.program,
                                programStage: $scope.currentEvent.programStage,
                                orgUnit: $scope.currentEvent.orgUnit,
                                status: $scope.currentEvent.status ? 'COMPLETED' : 'ACTIVE',
                                eventDate: DateUtils.formatFromUserToApi($scope.currentEvent.eventDate),
                                event: $scope.currentEvent.event, 
                                dataValues: dataValues
                            };

            if($scope.selectedProgramStage.captureCoordinates){
                updatedEvent.coordinate = {latitude: $scope.currentEvent.coordinate.latitude ? $scope.currentEvent.coordinate.latitude : '',
                                         longitude: $scope.currentEvent.coordinate.longitude ? $scope.currentEvent.coordinate.longitude : ''};             
            }

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

            DHIS2EventFactory.update(updatedEvent).then(function(data){            
                //reflect the change in the gird            
                $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);    
                $scope.updateFileNames();
                $scope.outerForm.submitted = false;            
                $scope.editingEventInFull = false;
                $scope.currentEvent = {};
                $scope.currentEventOriginialValue = angular.copy($scope.currentEvent); 
            });   
        });
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
            $scope.currentElement.updated = false;
            return;
        }

        //get new and old values
        var newValue = $scope.currentEvent.eventDate;   
        var oldValue = $scope.currentEventOriginialValue.eventDate;
        
        if ($scope.currentEvent.eventDate === '') {
            $scope.currentEvent.eventDate = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
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
                
                //update original value
                $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);      
                
                $scope.currentElement.updated = true;
                $scope.updateSuccess = true;
            });
        }        
    };
            
    $scope.updateEventDataValue = function(dataElement){

        $scope.updateSuccess = false;
        
        //get current element
        $scope.currentElement = {id: dataElement, pending: true, updated: false, failed: false};
        
        //get new and old values
        var newValue = $scope.currentEvent[dataElement];        
        var oldValue = $scope.currentEventOriginialValue[dataElement];
        
        //check for form validity
        if( $scope.isFormInvalid() ){
            $scope.currentElement.updated = false;
            
            //reset value back to original
            $scope.currentEvent[dataElement] = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
            return;            
        }
        
        if( $scope.prStDes[dataElement].compulsory && !newValue ) {
            $scope.currentElement.updated = false;                        
            
            //reset value back to original
            $scope.currentEvent[dataElement] = oldValue;            
            $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
            return;
        }        

        if( newValue !== oldValue ){            
            newValue = CommonUtils.formatDataValue(null, newValue, $scope.prStDes[dataElement].dataElement, $scope.optionSets, 'API');            
            var updatedSingleValueEvent = {event: $scope.currentEvent.event, dataValues: [{value: newValue, dataElement: dataElement}]};
            var updatedFullValueEvent = DHIS2EventService.reconstructEvent($scope.currentEvent, $scope.selectedProgramStage.programStageDataElements);

            DHIS2EventFactory.updateForSingleValue(updatedSingleValueEvent, updatedFullValueEvent).then(function(data){
                
                //reflect the new value in the grid
                $scope.dhis2Events = DHIS2EventService.refreshList($scope.dhis2Events, $scope.currentEvent);
                
                //update original value
                $scope.currentEventOriginialValue = angular.copy($scope.currentEvent);      
                
                $scope.currentElement.pending = false;
                $scope.currentElement.updated = true;
                $scope.updateSuccess = true;
            }, function(){
                $scope.currentElement.pending = false;
                $scope.currentElement.updated = false;
                $scope.currentElement.failed = true;
            });
        }
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
                $scope.currentEvent = {}; 
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

    $scope.getExportList = function(format) {

        var deferred = $q.defer();
        var fieldsToExport = $filter('filter')($scope.eventGridColumns, {show: true});
        var idList = ["programStage", "orgUnit", "program", "event", "status", "eventDate", "created"];
        var eventsJSON = [];
        var eventsJSONIndex = -1;
        var dataValuesJSON;
        var headers = [];
        var row;
        var rowXML;
        var eventsCSV = [];
        var eventsXML = '';
        var nameToIdMap = {};
        var emptyRow = [];
        if (!format || ($scope.model.exportFormats.indexOf(format) === -1)) {
            return;
        }
        format = format.toLowerCase();

        eventsCSV[0] = angular.copy(idList);

        for (var ind = 0; ind < fieldsToExport.length; ind++) {
            emptyRow[ind] = null;
            nameToIdMap[fieldsToExport[ind].id] = fieldsToExport[ind].displayName;
        }


        initExportList();

        /*Get All the events list from the server*/
        DHIS2EventFactory.getByStage($scope.selectedOrgUnit.id, $scope.selectedProgramStage.id,
            $scope.attributeCategoryUrl, true).then(function (data) {

            if (angular.isObject(data.events)) {
                angular.forEach(data.events, function (event) {
                    ++eventsJSONIndex;
                    eventsJSON[eventsJSONIndex] = {};
                    row = angular.copy(emptyRow);
                    rowXML = angular.copy(emptyRow);
                    if (format === 'xml') {
                        eventsXML += '<event>';
                    }
                    dataValuesJSON = [];
                    angular.forEach(event.dataValues, function (dataValue) {
                        if ($scope.prStDes[dataValue.dataElement]) {
                            var val = dataValue.value;
                            if (angular.isObject($scope.prStDes[dataValue.dataElement].dataElement)) {
                                val = CommonUtils.formatDataValue(null, val, $scope.prStDes[dataValue.dataElement].dataElement, $scope.optionSets, 'USER');
                            }
                            event[dataValue.dataElement] = val;

                            insertDataValueToRow(dataValue.dataElement, val);
                        }
                    });

                    event.eventDate = DateUtils.formatFromApiToUser(event.eventDate);
                    event['eventDate'] = event.eventDate;

                    event.created = DateUtils.formatFromApiToUser(event.created);
                    event['created'] = event.created;


                    if (format === 'xml' || format === 'csv') {
                        insertItemToRow(event, 'programStage');
                        insertItemToRow(event, 'orgUnit');
                        insertItemToRow(event, 'program');
                        insertItemToRow(event, 'event');
                        insertItemToRow(event, 'status');
                        insertItemToRow(event, 'eventDate');
                        insertItemToRow(event, 'created');
                        insertRowToExportList();
                    } else if (format === 'json') {
                        if (event['programStage']) {
                            eventsJSON[eventsJSONIndex]['programStage'] = event['programStage'];
                        }
                        if (event['orgUnit']) {
                            eventsJSON[eventsJSONIndex]['orgUnit'] = event['orgUnit'];
                        }
                        if (event['program']) {
                            eventsJSON[eventsJSONIndex]['program'] = event['program'];
                        }
                        if (event['event']) {
                            eventsJSON[eventsJSONIndex]['event'] = event['event'];
                        }
                        if (event['status']) {
                            eventsJSON[eventsJSONIndex]['status'] = event['status'];
                        }
                        if (event['eventDate']) {
                            eventsJSON[eventsJSONIndex]['eventDate'] = event['eventDate'];
                        }

                        if (dataValuesJSON.length > 0) {
                            eventsJSON[eventsJSONIndex]["dataValues"] = dataValuesJSON;
                        }
                    }
                    delete event.dataValues;
                });

                if (format === 'xml') {
                    eventsXML += '</events>';
                }
            }

            if (format === 'json') {
                saveFile(format, JSON.stringify({"events": eventsJSON}));
            } else if (format === 'xml') {
                saveFile(format, eventsXML);
            } else if (format === 'csv') {
                deferred.resolve(eventsCSV);
            }
        });

        function saveFile(format, data) {
            var fileName = "eventList." + format;// any file name with any extension
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


        function initExportList() {
            var item, id;
            for (var index = 0; index < fieldsToExport.length; index++) {
                item = fieldsToExport[index];
                id = item.id === "uid" ? "event" : item.id;
                if (idList.indexOf(id) === -1) {
                    idList.push(id);
                    eventsCSV[0].push(item.displayName);
                }
                if (format === 'json') {
                    headers.push({
                        "name": item.displayName
                    });
                }
            }
            if (format === 'xml') {
                eventsXML += '<events>';
            }
        }

        function insertDataValueToRow(dataElement, value) {
            var index = idList.indexOf(dataElement);
            if (index > -1) {
                if (format === 'xml' || format === 'csv') {
                    row[index] = {value: value, dataElement: dataElement, isDataValue: true};
                } else if (format === 'json') {
                    dataValuesJSON.push(value);
                }
            }
        }

        function insertItemToRow(item, name) {
            var index = idList.indexOf(name);
            if (index > -1) {
                if (format === 'xml' || format === 'csv') {
                    row[index] = {value: item[name], dataElement: name, isDataValue: false};
                }
            }
        }

        function insertRowToExportList() {
            var dataValues = '';
            var csvRow = [];
            for (var index = 0; index < row.length; index++) {
                if (row[index]) {
                    if (format === 'xml') {
                        if (row[index].isDataValue) {
                            if (dataValues.length === 0) {
                                dataValues += '<datavalues>';
                            }
                            dataValues += '<dataValue dataElementId="' + row[index].dataElement + '" ' +
                                'dataElementName="' + nameToIdMap[row[index].dataElement] + '" ' +
                                'value="' + row[index].value + '"/>';
                        } else {
                            eventsXML += '<' + row[index].dataElement + '>' + row[index].value + '</' + row[index].dataElement + '>';
                        }
                    } else if (format === 'csv') {
                        csvRow.push(row[index].value);
                    }
                } else {
                    if (format === 'csv') {
                        csvRow.push(null);
                    }
                }
            }
            if (format === 'csv') {
                eventsCSV.push(csvRow);
            }

            if (format === 'xml') {
                if (dataValues.length > 0) {
                    eventsXML += dataValues + '</datavalues>';
                }
                eventsXML += '</event>';
            }
        }

        return deferred.promise;
    };

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
            templateUrl: '../dhis-web-commons/angular-forms/audit-history.html',
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
    $scope.$on('ruleeffectsupdated', function(event, args) {
        $scope.warningMessages = [];
        $scope.warningMessagesOnComplete = [];
        $scope.errorMessagesOnComplete = [];
        $scope.hiddenSections = [];
        $scope.hiddenFields = [];
        $scope.assignedFields = [];
        $scope.displayTextEffects = [];

        if($rootScope.ruleeffects[args.event]) {
            //Establish which event was affected:
            var affectedEvent = $scope.currentEvent;
            //In most cases the updated effects apply to the current event. In case the affected event is not the current event, fetch the correct event to affect:
            if(args.event !== affectedEvent.event) {
                angular.forEach($scope.currentStageEvents, function(searchedEvent) {
                    if(searchedEvent.event === args.event) {
                        affectedEvent = searchedEvent;
                    }
                });
            }
            angular.forEach($rootScope.ruleeffects[args.event], function(effect) {
                
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
                            $scope.warningMessages.push(effect.content + (effect.data ? effect.data : ""));
                        }
                        $scope.warningMessagesOnComplete.push(effect.content + (effect.data ? effect.data : ""));
                    }
                    else if(effect.action === "ASSIGN") {
                        var processedValue = effect.data;
                        
                        //For "ASSIGN" actions where we have a dataelement, we save the calculated value to the dataelement:
                        if($scope.prStDes[effect.dataElement.id].dataElement.optionSet) {
                            processedValue = OptionSetService.getName(
                                $scope.optionSets[$scope.prStDes[effect.dataElement.id].dataElement.optionSet.id].options, processedValue);
                        }  
                        processedValue = processedValue === "true" ? true : processedValue;
                        processedValue = processedValue === "false" ? false : processedValue;

                        affectedEvent[effect.dataElement.id] = processedValue;
                        $scope.assignedFields[effect.dataElement.id] = true;
                    }
                    else if(effect.action === "DISPLAYKEYVALUEPAIR") {
                        $scope.displayTextEffects.push({name:effect.content,text:effect.data});
                    }
                    else if(effect.action === "DISPLAYTEXT") {
                        $scope.displayTextEffects.push({text:effect.data + effect.content});
                    }
                }
            });
        }
    });
    
    $scope.executeRules = function() {
        $scope.currentEvent.event = !$scope.currentEvent.event ? 'SINGLE_EVENT' : $scope.currentEvent.event;
        var flags = {debug: true, verbose: false};
        TrackerRulesExecutionService.loadAndExecuteRulesScope($scope.currentEvent,$scope.selectedProgram.id,$scope.selectedProgramStage.id,$scope.prStDes,$scope.optionSets,$scope.selectedOrgUnit.id,flags);
    };
       
    
    $scope.formatNumberResult = function(val){        
        return dhis2.validation.isNumber(val) ? val : '';
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
    
    $scope.deleteFile = function(dataElement){
        
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
            $scope.updateEventDataValue(dataElement);
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

})

.controller('NotesController', function($scope, $modalInstance, dhis2Event){

    $scope.dhis2Event = dhis2Event;

    $scope.close = function () {
        $modalInstance.close();
    };
});