import L from 'leaflet';
import 'leaflet-geocoder-mapzen';
import 'leaflet-contextmenu';

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
                    'ui.select',
                    'angularLocalStorage',
                    'pascalprecht.translate',
                    'leaflet-directive',
                    ])

.value('DHIS2URL', '../api')

.config(function ($routeProvider, $translateProvider, $logProvider) {

    $routeProvider.when('/', {
        templateUrl: 'views/home.html',
        controller: 'MainController'
    }).otherwise({
        redirectTo: '/'
    });

    $translateProvider.preferredLanguage('en');
    $translateProvider.useSanitizeValueStrategy('escaped');
    $translateProvider.useLoader('i18nLoader');

    $logProvider.debugEnabled(false);
});
