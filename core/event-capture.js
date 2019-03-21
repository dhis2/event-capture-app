
/* global dhis2, angular, i18n_ajax_login_failed, _, selection, selection */

dhis2.util.namespace('dhis2.ec');

// whether current user has any organisation units
dhis2.ec.emptyOrganisationUnits = false;

var i18n_no_orgunits = 'No organisation unit attached to current user, no data entry possible';
var i18n_offline_notification = 'You are offline, data will be stored locally';
var i18n_online_notification = 'You are online';
var i18n_need_to_sync_notification = 'There is data stored locally, please upload to server';
var i18n_sync_now = 'Upload';
var i18n_uploading_data_notification = 'Uploading locally stored data to the server';

var PROGRAMS_METADATA = 'EVENT_PROGRAMS';

var EVENT_VALUES = 'EVENT_VALUES';

var optionSetIds = [];
var categoryOptionIds = [];
var programCategoryOptions = {};

var batchSize = 50;
var programBatchSize = 50;
export var DHIS2URL = '../api/30';
var hasAllAccess = false;

dhis2.ec.isOffline = false;
dhis2.ec.store = null;
dhis2.ec.memoryOnly = $('html').hasClass('ie7') || $('html').hasClass('ie8');
var adapters = [];    
if( dhis2.ec.memoryOnly ) {
    adapters = [ dhis2.storage.InMemoryAdapter ];
} else {
    adapters = [ dhis2.storage.IndexedDBAdapter, dhis2.storage.DomLocalStorageAdapter, dhis2.storage.InMemoryAdapter ];
}

dhis2.ec.store = new dhis2.storage.Store({
    name: 'dhis2ec',
    adapters: [dhis2.storage.IndexedDBAdapter, dhis2.storage.DomSessionStorageAdapter, dhis2.storage.InMemoryAdapter],
    objectStores: ['programs', 'optionSets', 'events', 'programRules', 'programRuleVariables', 'programIndicators', 'ouLevels', 'constants','programAccess','optionGroups']
});

(function($) {
    $.safeEach = function(arr, fn)
    {
        if (arr)
        {
            $.each(arr, fn);
        }
    };
})(jQuery);

/**
 * Page init. The order of events is:
 *
 * 1. Load ouwt 2. Load meta-data (and notify ouwt) 3. Check and potentially
 * download updated forms from server
 */
$(document).ready(function()
{
    $.ajaxSetup({
        type: 'POST',
        cache: false
    });

    $('#loaderSpan').show();
    
});

$(document).bind('dhis2.online', function(event, loggedIn)
{
    if (loggedIn)
    {   
        dhis2.ec.isOffline = false;
        
        var OfflineECStorageService = angular.element('body').injector().get('OfflineECStorageService');

        OfflineECStorageService.hasLocalData().then(function(localData){
            if(localData){
                var message = i18n_need_to_sync_notification + ' <button id="sync_button" type="button">' + i18n_sync_now + '</button>';

                setHeaderMessage(message);

                $('#sync_button').bind('click', uploadLocalData);
            }
            else{
                if (dhis2.ec.emptyOrganisationUnits) {
                    setHeaderMessage(i18n_no_orgunits);
                }
                else {
                    setHeaderDelayMessage(i18n_online_notification);
                }
            }
        });
    }
    else
    {
        var form = [
            '<form style="display:inline;">',
            '<label for="username">Username</label>',
            '<input name="username" id="username" type="text" style="width: 70px; margin-left: 10px; margin-right: 10px" size="10"/>',
            '<label for="password">Password</label>',
            '<input name="password" id="password" type="password" style="width: 70px; margin-left: 10px; margin-right: 10px" size="10"/>',
            '<button id="login_button" type="button">Login</button>',
            '</form>'
        ].join('');

        setHeaderMessage(form);
        ajax_login();
    }
});

$(document).bind('dhis2.offline', function()
{
    if (dhis2.ec.emptyOrganisationUnits) {
        setHeaderMessage(i18n_no_orgunits);
    }
    else {
        dhis2.ec.isOffline = true;
        setHeaderMessage(i18n_offline_notification);
    }
});
    
export function ajax_login()
{
    $('#login_button').bind('click', function()
    {
        var username = $('#username').val();
        var password = $('#password').val();

        $.post('../dhis-web-commons-security/login.action', {
            'j_username': username,
            'j_password': password
        }).success(function()
        {
            var ret = dhis2.availability.syncCheckAvailability();

            if (!ret)
            {
                alert(i18n_ajax_login_failed);
            }
        });
    });
}

export function downloadMetaData(){    
    
    console.log('Loading required meta-data');
    var def = $.Deferred();
    var promise = def.promise();
    
    promise = promise.then( dhis2.ec.store.open );
    promise = promise.then( getSystemSetting );
    promise = promise.then( getUserSetting );
    promise = promise.then( getUserProfile );
    promise = promise.then( setHasAllAccess);
    promise = promise.then( getConstants );
    promise = promise.then( getOrgUnitLevels );    
    promise = promise.then( getMetaPrograms );
    promise = promise.then( filterMissingPrograms );
    promise = promise
        .then( getPrograms )
        .then( getCategories )
        .then( cachePrograms );
    promise = promise.then( getOptionSetsForDataElements );
    promise = promise.then( getOptionSets );
    promise = promise.then( getProgramAccess);
    promise = promise.then( getOptionGroups)
    promise.done( function() {
        //Enable ou selection after meta-data has downloaded
        $( "#orgUnitTree" ).removeClass( "disable-clicks" );
        console.log( 'Finished loading meta-data' );         
        dhis2.availability.startAvailabilityCheck();
        console.log( 'Started availability check' );

        var SessionStorageService = angular.element('body').injector().get('SessionStorageService');
        var userSettings = SessionStorageService.get('USER_SETTING');
        var useShortName = userSettings.keyAnalysisDisplayProperty === 'shortName';
        selection.setDisplayShortNames(useShortName);
        selection.responseReceived();

    });

    def.resolve();
}

function getSystemSetting()
{   
    if(localStorage['SYSTEM_SETTING']){
       return; 
    }
    
    return dhis2.tracker.getTrackerObject(null, 'SYSTEM_SETTING', DHIS2URL + '/systemSettings.json', 'key=keyGoogleMapsApiKey&key=keyCalendar&key=keyDateFormat&key=keyAnalysisDisplayProperty', 'localStorage', dhis2.ec.store);
}

function getUserSetting()
{   
    var SessionStorageService = angular.element('body').injector().get('SessionStorageService');
    
    //only use the cached version if we're offline, otherwise fetch the settings if they have changed since last time.
    if( dhis2.ec.isOffline && SessionStorageService.get('USER_SETTING') ){
        return;
    }
    
    return dhis2.tracker.getTrackerObject(null, 'USER_SETTING', DHIS2URL + '/userSettings.json', 'key=keyDbLocale&key=keyUiLocale&key=keyCurrentStyle&key=keyStyle&key=keyAnalysisDisplayProperty', 'sessionStorage', dhis2.ec.store);
}

function getUserProfile()
{
    var SessionStorageService = angular.element('body').injector().get('SessionStorageService');
    
    return dhis2.tracker.getTrackerObject(null, 'USER_PROFILE', DHIS2URL + '/me.json', 'fields=id,displayName,userCredentials[username,userRoles[id,programs,authorities]],organisationUnits[id,displayName,level,path,children[id,displayName,level,children[id]]],dataViewOrganisationUnits[id,displayName,level,path,children[id,displayName,level,children[id]]],teiSearchOrganisationUnits[id,displayName,level,path,children[id,displayName,level,children[id]]]', 'sessionStorage', dhis2.ec.store);
}

function getConstants()
{
    dhis2.ec.store.getKeys( 'constants').done(function(res){        
        if(res.length > 0){
            return;
        }        
        return dhis2.tracker.getTrackerObjects('constants', 'constants', DHIS2URL + '/constants.json', 'paging=false&fields=id,displayName,value', 'idb', dhis2.ec.store);        
    });    
}

function getOrgUnitLevels()
{
    dhis2.ec.store.getKeys( 'ouLevels').done(function(res){        
        if(res.length > 0){
            return;
        }        
        return dhis2.tracker.getTrackerObjects('ouLevels', 'organisationUnitLevels', DHIS2URL + '/organisationUnitLevels.json', 'filter=level:gt:1&fields=id,displayName,level&paging=false', 'idb', dhis2.ec.store);
    }); 
}

function getMetaPrograms()
{    
    return dhis2.tracker.getTrackerObjects('programs', 'programs', DHIS2URL + '/programs.json', 'filter=programType:eq:WITHOUT_REGISTRATION&paging=false&fields=id,version,categoryCombo[id,categories[id,categoryOptions[id]]],programStages[programStageDataElements[dataElement[optionSet[id,version]]]]', 'temp', dhis2.ec.store);    
}

function filterMissingPrograms( programs )
{
    if( !programs ){
        return;
    }
    
    var mainDef = $.Deferred();
    var mainPromise = mainDef.promise();

    var def = $.Deferred();
    var promise = def.promise();

    var builder = $.Deferred();
    var build = builder.promise();

    var ids = [];
    _.each( _.values( programs ), function ( program ) {
        programCategoryOptions[program.id] = {};        
        if( program.categoryCombo && program.categoryCombo.categories ){
            programCategoryOptions[program.id][program.categoryCombo.id] = {};
            _.each( _.values( program.categoryCombo.categories ), function ( ca ) {                
                if( ca.categoryOptions ){
                    programCategoryOptions[program.id][program.categoryCombo.id][ca.id] = [];
                    _.each( _.values( ca.categoryOptions ), function ( co ) {
                        categoryOptionIds.push( co.id );
                        programCategoryOptions[program.id][program.categoryCombo.id][ca.id].push( co.id );
                    });
                }
            });
        }

        if(program.programStages && program.programStages[0] && program.programStages[0].programStageDataElements){
            build = build.then(function() {
                var d = $.Deferred();
                var p = d.promise();
                dhis2.ec.store.get('programs', program.id).done(function(obj) {
                    if(!obj || obj.version !== program.version) {                        
                        ids.push( program.id );
                    }
                    d.resolve();
                });
                return p;
            });
        }        
    });
    
    build.done(function() {
        def.resolve();
        promise = promise.done( function () {
            mainDef.resolve( programs, ids );
        } );
    }).fail(function(){
        mainDef.resolve( null, null );
    });

    builder.resolve();

    return mainPromise;
}

function getPrograms( programs, ids )
{    
    if( !ids || !ids.length || ids.length < 1){
        return;
    }
    
    var batches = dhis2.tracker.chunk( ids, programBatchSize );
    
    var mainDef = $.Deferred();
    var mainPromise = mainDef.promise();

    var def = $.Deferred();
    var promise = def.promise();

    var builder = $.Deferred();
    var build = builder.promise();
    
    var metaCategories = []; // extract category ids from programs and retrieve category options based on this in a separate request
    var cachePrograms = [];

    _.each( _.values( batches ), function ( batch ) {        
        promise = getBatchPrograms( programs, batch );
        promise = promise.then(function(pr, b, batchCategories, batchCachePrograms) {
            metaCategories = metaCategories.concat(batchCategories);
            cachePrograms = cachePrograms.concat(batchCachePrograms);
            var categoryDef = $.Deferred();
            categoryDef.resolve(pr, b);
            return categoryDef.promise();
        });
        promise = promise.then( getMetaProgramIndicators );
        promise = promise.then( getProgramIndicators );
        promise = promise.then( getMetaProgramRules );
        promise = promise.then( getProgramRules );
        promise = promise.then( getMetaProgramRuleVariables );
        promise = promise.then( getProgramRuleVariables );
    });

    build.done(function() {
        def.resolve();
        promise = promise.done( function () {            
            mainDef.resolve( programs, ids, metaCategories, cachePrograms );
        } );        
        
    }).fail(function(){
        mainDef.resolve( null, null );
    });

    builder.resolve();

    return mainPromise;
}

function getBatchPrograms( metaPrograms, batch )
{   
    var ids = '[' + batch.toString() + ']';
    
    var def = $.Deferred();
    
    $.ajax( {
        url: DHIS2URL + '/programs.json',
        type: 'GET',
        data: 'fields=*,categoryCombo[id,displayName,isDefault,categories[id,displayName]],organisationUnits[id,displayName],programStages[*,dataEntryForm[*],programStageSections[id,displayName,description,sortOrder,dataElements[id]],programStageDataElements[*,dataElement[*,optionSet[id]]]]&paging=false&filter=id:in:' + ids
    }).done( function( response ){
        var metaCategories = [];
        var cachePrograms = [];
        if(response.programs){
            _.each(_.values( response.programs), function(program){
                var ou = {};
                if(program.organisationUnits){
                    program.organisationUnits.forEach(function(o) {
                        ou[o.id] = o.displayName;
                    })
                }

                if(program.categoryCombo && program.categoryCombo.categories){
                    program.categoryCombo.categories.forEach(function(category) {
                        metaCategories.push({
                            id: category.id,
                            displayName: category.displayName,
                        });  
                    });
                }

                program.organisationUnits = ou;                
                // var x = dhis2.ec.store.set( 'programs', program );
                cachePrograms.push(program);
            });
        }
        
        def.resolve( metaPrograms, batch, metaCategories, cachePrograms );
    });

    return def.promise();
}

// I would have liked to restructure this, moving stuff into different files etc, but the app is soon to be deprecated so will stick all categories functions in here
// ------------------------------------------------------------------------------------------------------------------------------------------------------------------
function getUniqeCategories(categories) {
    var seen = {};
    return categories
        .filter(function(category) {
            var key = category.id;
            return seen.hasOwnProperty(key) ? false : (seen[key] = true);
        });
}

function requestCategoryOptions(ajaxRequest, pageNr, pageSize) {
    var ajaxRequestPage = {
        url: ajaxRequest.url,
        type: ajaxRequest.type,
        data: ajaxRequest.data + '&page=' + pageNr + '&pageSize=' + pageSize,
    };

    return $.ajax(ajaxRequestPage)
            .then(function(categoryOptionsContainer) {
                var categoryOptions = categoryOptionsContainer.categoryOptions;
                if (categoryOptions && categoryOptions.length === pageSize) {
                    return requestCategoryOptions(ajaxRequest, pageNr += 1, pageSize)
                        .then(function(categoryOptionsFromPageHierarchy) {
                            return categoryOptions.concat(categoryOptionsFromPageHierarchy);
                        });
                }
                return categoryOptions || [];
            });
}

function getCategoryOptions(ids) {
    var ajaxRequest = {
        url: DHIS2URL + '/categoryOptions.json',
        type: 'GET',
        data: 'fields=id,displayName,categories, organisationUnits, access[*]&paging=true&filter=categories.id:in:[' + ids.toString() + ']&filter=access.data.read:in:[true]&totalPages=false'
    };

    return requestCategoryOptions(ajaxRequest, 1, 10000)
        .then(function(categoryOptions) {
           return categoryOptions;
        });
}

function getOptionsByCategory(categoryOptionsBatches) {
    return categoryOptionsBatches.reduce((accOptionsByCategory, batchArray) =>
        batchArray.reduce((accOptionsByCategoryForBatch, option) => {
            const categories = option.categories;
            accOptionsByCategoryForBatch = categories.reduce((accOptionsByCategoryForBatchInProgress, category) => {
                const organisationUnits = option.organisationUnits;
                const currentOptionsForCategory = accOptionsByCategoryForBatchInProgress[category.id] || {};
                currentOptionsForCategory[option.id] = {
                    id: option.id,
                    displayName: option.displayName,
                    access: option.access,
                    organisationUnits: organisationUnits && organisationUnits.length > 0 ?
                        organisationUnits.map(ou => ou.id) :
                        null,
                };
                accOptionsByCategoryForBatchInProgress[category.id] = currentOptionsForCategory;
                return accOptionsByCategoryForBatchInProgress;
            }, accOptionsByCategoryForBatch);
            return accOptionsByCategoryForBatch;
        }, accOptionsByCategory), {});
}

function buildCacheCategories(
    uniqueCategories,
    optionsByCategory,
) {
    const categoriesToStore = uniqueCategories
        .reduce((accCategoriesToStore, category) => {
            accCategoriesToStore[category.id] = {
                id: category.id,
                displayName: category.displayName,
                categoryOptions: optionsByCategory[category.id] ?
                    Object
                        .keys(optionsByCategory[category.id])
                        .map(optionKey => optionsByCategory[category.id][optionKey]) :
                    [],
            };
            return accCategoriesToStore;
        }, {});
    return categoriesToStore;
}

function updateProgramsWithCategories(categoriesToStore, cachePrograms) {
    return cachePrograms
        .map(function(program) {
            if (program.categoryCombo && program.categoryCombo.categories) {
                var programCategories = program.categoryCombo.categories;
                program.categoryCombo.categories = programCategories
                    .map(function(c) {
                        return categoriesToStore[c.id];
                    });
            }
            return program;
        });
}

function getCategories(programs, batch, metaCategories, cachePrograms) {
    if (!metaCategories || metaCategories.length === 0) {
        var def = $.Deferred();
        def.resolve(programs, batch, cachePrograms);
        return def.promise();            
    }

    var uniqueCategories = getUniqeCategories(metaCategories);
    var uniqueCateogryIds = uniqueCategories.map(uc => uc.id);
    var categoryIdBatches = dhis2.tracker.chunk(uniqueCateogryIds, 50);

    var def = $.Deferred();

    $.when(
            ...categoryIdBatches
                .map(function(batch) {
                    return getCategoryOptions(batch);
                })
        )
        .then((...categoryOptionsBatches) => getOptionsByCategory(categoryOptionsBatches))
        .then(optionsByCategory => buildCacheCategories(uniqueCategories, optionsByCategory))
        .then(categoriesToStore => {
            var updatedCachePrograms = updateProgramsWithCategories(categoriesToStore, cachePrograms);
            def.resolve(programs, batch, cachePrograms);
        });
    
    return def.promise();
}

function cachePrograms(programs, batch, cachePrograms) {
    var def = $.Deferred();

    if (!cachePrograms || cachePrograms.length === 0) {
        def.resolve(programs, batch);
        
    } else {
        dhis2.ec.store
            .setAll( 'programs', cachePrograms )
            .done(function() {
                def.resolve(programs, batch);
            });
    }
    
    return def.promise();
}
// ------------------------------------------------------------------------------------------------------------------------------------------------------------

function getOptionSetsForDataElements( programs )
{
    if( !programs ){
        return;
    }
    
    delete programs.programIds;
    
    var mainDef = $.Deferred();
    var mainPromise = mainDef.promise();

    var def = $.Deferred();
    var promise = def.promise();

    var builder = $.Deferred();
    var build = builder.promise();
    
    _.each( _.values( programs ), function ( program ) {        
        if(program.programStages){
            _.each(_.values( program.programStages), function( programStage) {                
                if(programStage.programStageDataElements){
                    _.each(_.values( programStage.programStageDataElements), function(prStDe){                        
                        if( prStDe.dataElement ){                                    
                            if( prStDe.dataElement.optionSet && prStDe.dataElement.optionSet.id ){
                                build = build.then(function() {
                                    var d = $.Deferred();
                                    var p = d.promise();
                                    dhis2.ec.store.get('optionSets', prStDe.dataElement.optionSet.id).done(function(obj) {                                    
                                        if( (!obj || obj.version !== prStDe.dataElement.optionSet.version) && optionSetIds.indexOf(prStDe.dataElement.optionSet.id) === -1) {                                
                                            optionSetIds.push( prStDe.dataElement.optionSet.id );
                                        }
                                        d.resolve();
                                    });
                                    return p;
                                });
                            }
                        }
                    });
                }
            });
        }
    });
    
    build.done(function() {
        def.resolve();
        promise = promise.done( function () {
            mainDef.resolve();
        } );
    }).fail(function(){
        mainDef.resolve( null, null );
    });
    
    builder.resolve();

    return mainPromise;    
}

function getOptionSets()
{    
    return dhis2.tracker.getBatches( optionSetIds, batchSize, null, 'optionSets', 'optionSets', DHIS2URL + '/optionSets.json', 'paging=false&fields=id,displayName,version,options[id,displayName,code]', 'idb', dhis2.ec.store );
}

function getObjectIds(data){
    return data && Array.isArray(data.self) ? data.self.map(function(obj) { return obj.id }) : [];
}

function getMetaProgramIndicators( programs, programIds )
{   
    programs.programIds = programIds;
    return dhis2.tracker.getTrackerMetaObjects(programs, 'programIndicators', DHIS2URL + '/programIndicators.json', 'paging=false&fields=id&filter=program.id:in:');
}

function getProgramIndicators( data )
{
    var ids = getObjectIds(data);
    return dhis2.tracker.getBatches(ids, batchSize, data.programs, 'programIndicators','programIndicators',DHIS2URL + '/programIndicators', 'fields=id,displayName,code,shortName,displayInForm,expression,displayDescription,description,filter,program[id]','idb', dhis2.ec.store);
}

function getMetaProgramRules( programs )
{
    return dhis2.tracker.getTrackerMetaObjects(programs, 'programRules', DHIS2URL + '/programRules.json', 'paging=false&fields=id&filter=program.id:in:');
}

function getProgramRules( data )
{
    var ids = getObjectIds(data);
    return dhis2.tracker.getBatches(ids, batchSize, data.programs, 'programRules','programRules',DHIS2URL + '/programRules', 'fields=id,displayName,condition,description,program[id],programStage[id],priority,programRuleActions[id,content,location,data,programRuleActionType,programStageSection[id],dataElement[id],trackedEntityAttribute[id],programIndicator[id],programStage[id],option[id],optionGroup[id]]','idb', dhis2.ec.store);
}

function getMetaProgramRuleVariables( programs )
{    
    return dhis2.tracker.getTrackerMetaObjects(programs, 'programRuleVariables', DHIS2URL + '/programRuleVariables.json', 'paging=false&fields=id&filter=program.id:in:');
}

function getProgramRuleVariables( data )
{
    var ids = getObjectIds(data);
    return dhis2.tracker.getBatches(ids, batchSize, data.programs, 'programRuleVariables','programRuleVariables',DHIS2URL + '/programRuleVariables', 'fields=id,displayName,programRuleVariableSourceType,program[id],programStage[id],dataElement[id],useCodeForOptionSet','idb', dhis2.ec.store);
}

function uploadLocalData()
{
    var OfflineECStorageService = angular.element('body').injector().get('OfflineECStorageService');
    setHeaderWaitMessage(i18n_uploading_data_notification);
     
    OfflineECStorageService.uploadLocalData().then(function(){        
        selection.responseReceived(); //notify angular
    });
}

//ACCESS
function setHasAllAccess(){
    var def = $.Deferred();
    var SessionStorageService = angular.element('body').injector().get('SessionStorageService');    
    var userProfile = SessionStorageService.get('USER_PROFILE');
    if(userProfile && userProfile.authorities){
        var r = $.grep(userProfile.authorities, function(a){ return a === 'ALL'});
        if(r.length > 0) hasAllAccess = true;
    }
    def.resolve();
    return def.promise();
}

function getProgramAccess(){
    return dhis2.tracker.getTrackerObjects('programAccess','programs', DHIS2URL+'/programs.json', 'filter=programType:eq:WITHOUT_REGISTRATION&paging=false&fields=id,access[data[read,write]],programStages[access[data[read,write]]]','temp', dhis2.ec.store).then(function(programAccesses){
        var programAccessesById = {};
        _.each(_.values(programAccesses), function(programAccess){
            if(hasAllAccess) programAccess.access.data = {read: true, write: true };
            programAccess.programStages = [];
            programAccessesById[programAccess.id] = programAccess;
        });

        return dhis2.tracker.getTrackerObjects('programStageAccess','programStages', DHIS2URL+'/programStages.json', 'paging=false&fields=id,program,access[data[read,write]]','temp', dhis2.ec.store).then(function(programStageAccesses){
            _.each(_.values(programStageAccesses), function(programStageAccess){
                if(programStageAccess.program && programAccessesById[programStageAccess.program.id]){
                    if(hasAllAccess) programStageAccess.access.data = {read : true, write: true};
                    programAccessesById[programStageAccess.program.id].programStages.push(programStageAccess);
                }
                
            });
            return dhis2.ec.store.setAll('programAccess',programAccesses);
        });

    });
}
function getOptionGroups(){
    return dhis2.tracker.getTrackerObjects('optionGroups','optionGroups', DHIS2URL+'/optionGroups.json', 'paging=false&fields=id,name,shortName,displayName,options[id]','idb',dhis2.ec.store);
}
