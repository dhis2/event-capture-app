// Tracker core
import 'd2-tracker/lib/dhis2.angular.services.js';
import 'd2-tracker/lib/dhis2.angular.directives.js';
import 'd2-tracker/lib/dhis2.angular.validations.js';
import 'd2-tracker/lib/dhis2.angular.filters.js';
import 'd2-tracker/lib/dhis2.angular.controllers.js';
import 'd2-tracker/lib/dhis2.angular.templates.js';

import L from 'leaflet';
import 'leaflet-geocoder-mapzen';
import 'leaflet-contextmenu';
import 'd2-tracker/lib/Google.js';

L.Icon.Default.imagePath = '../dhis-web-commons/leaflet/images';

import './services.js';
import './directives.js';
import './controllers.js';
import './filters.js';
import './ng-csv.js';

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
                    ])

.value('DHIS2URL', '../api/28')

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
});
