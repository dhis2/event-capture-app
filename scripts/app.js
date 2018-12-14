// Tracker core
import 'd2-tracker/lib/dhis2.tracker-metadata.js';
import 'd2-tracker/lib/dhis2.angular.services.js';
import 'd2-tracker/lib/dhis2.angular.directives.js';
import 'd2-tracker/lib/dhis2.angular.validations.js';
import 'd2-tracker/lib/dhis2.angular.filters.js';
import 'd2-tracker/lib/dhis2.angular.controllers.js';
import 'd2-tracker/lib/dhis2.angular.templates.js';
import 'd2-tracker/src/styles/style.css';

import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

import 'leaflet-contextmenu';
import 'd2-tracker/lib/Google.js';

import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.js';

import 'leaflet-draw/dist/leaflet.draw.js';
import 'leaflet-draw/dist/leaflet.draw.css';

import 'leaflet/dist/leaflet.css';
import 'leaflet-contextmenu/dist/leaflet.contextmenu.css';

L.Icon.Default.imagePath = '../dhis-web-commons/leaflet/images';

import './services.js';
import './directives.js';
import './controllers.js';
import './filters.js';
import './ng-csv.js';
import 'angular-vs-repeat';

/* App Module */

const eventCapture = angular.module('eventCapture',
                    ['ui.bootstrap',
                    'ngRoute',
                    'ngCookies',
                    'ngMessages',
                    'ngSanitize',
                    'eventCaptureDirectives',
                    'eventCaptureControllers',
                    'eventCaptureServices',
                    'eventCaptureFilters',
                    'd2Filters',
                    'd2Directives',
                    'd2Services',
                    'd2Controllers',
                    'd2Templates',
                    'ui.select',
                    'angularLocalStorage',
                    'pascalprecht.translate',
                    'leaflet-directive',
                    'vs-repeat',
                    ])

.value('DHIS2URL', '../api/30')

.value('DHIS2COORDINATESIZE', 6)

.config(function ($routeProvider, $translateProvider, $logProvider) {

    $routeProvider.when('/', {
        templateUrl: 'views/home.html',
        controller: 'MainController',
        reloadOnSearch: false
    }).otherwise({
        redirectTo: '/'
    });

    $translateProvider.preferredLanguage('en');
    $translateProvider.useSanitizeValueStrategy('escaped');
    $translateProvider.useLoader('i18nLoader');

    $logProvider.debugEnabled(false);
})
.run(function(){
    Array.prototype.toHashMap = function(key, objFunc){
        var hashmap = this.reduce(function(map, obj) {
            if(objFunc) objFunc(map,obj,key);
            if(obj[key] ==='jYDntjPUD5C'){
                var g = 1;
            }
            map[obj[key]] = obj;
            return map;
        },{});
        return hashmap;
    }
});
