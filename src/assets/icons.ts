import { addIcon } from "obsidian"

const icons = [
    {
        name: 'wewrite',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" data-swindex="0" d="M27 15v15H2V5h15m13 1l-4-4L9 19l-2 6l6-2Zm-8 0l4 4ZM9 19l4 4Z"></path></svg>`
    },
    {
        name:'wewrite-news',
        svg:`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path fill="currentColor" d="M2 4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm2 1v14h16V5zm2 2h6v6H6zm2 2v2h2V9zm6 0h4V7h-4zm4 4h-4v-2h4zM6 15v2h12v-2z"></path></svg>`
    },
    {
        name:'wewrite-draft',
        // svg:`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 1025 1024"><path fill="currentColor" d="M960.85 1024h-896q-27 0-45.5-19T.85 960V704q0-27 18.5-45.5t45.5-18.5h128q20 0 38.5 8.5t25.5 23.5l33.5 100.5l30.5 91.5q8 20 24 26t45 6h249q29 0 43.5-6t22.5-26q51-154 64-192q13-32 64-32h128q26 0 45 18.5t19 45.5v256q0 26-18.5 45t-45.5 19m-304-243q-9 21-32.5 36t-49.5 15h-121q-26 0-50-15t-33-36l-71-205h-235V64q0-27 18.5-45.5T128.85 0h768q27 0 45.5 18.5t18.5 45.5v512h-235zm-432-333h128q13 0 22.5-9.5t9.5-22.5t-9.5-22.5t-22.5-9.5h-128q-13 0-22.5 9.5t-9.5 22.5t9.5 22.5t22.5 9.5m256-256h-256q-13 0-22.5 9.5t-9.5 22.5t9.5 22.5t22.5 9.5h256q13 0 22.5-9.5t9.5-22.5t-9.5-22.5t-22.5-9.5m320 0h-192q-13 0-22.5 9.5t-9.5 22.5t9.5 22.5t22.5 9.5h192q13 0 22.5-9.5t9.5-22.5t-9.5-22.5t-22.5-9.5m32 224q0-13-9.5-22.5t-22.5-9.5h-320q-13 0-22.5 9.5t-9.5 22.5t9.5 22.5t22.5 9.5h320q13 0 22.5-9.5t9.5-22.5"></path></svg>`
        // svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2C20.5523 2 21 2.44772 21 3V6.757L19 8.757V4H5V20H19V17.242L21 15.242V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V3C3 2.44772 3.44772 2 4 2H20ZM21.7782 8.80761L23.1924 10.2218L15.4142 18L13.9979 17.9979L14 16.5858L21.7782 8.80761ZM13 12V14H8V12H13ZM16 8V10H8V8H16Z"></path></svg>`
        svg:`<svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 5L29.7 43L22.1 25.9L5 18.3L43 5Z" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M43.0001 5L22.1001 25.9" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    {
        name:'wewrite-translate',
        // svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"></path><path fill="currentColor" d="M17 10.5a1.5 1.5 0 0 1 1.493 1.356L18.5 12v.5h1a2 2 0 0 1 1.995 1.85l.005.15v3a2 2 0 0 1-1.85 1.995l-.15.005h-1v.5a1.5 1.5 0 0 1-2.993.144L15.5 20v-.5h-1a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h1V12a1.5 1.5 0 0 1 1.5-1.5m-12 4A1.5 1.5 0 0 1 6.5 16v1a.5.5 0 0 0 .5.5h3a1.5 1.5 0 0 1 0 3H7A3.5 3.5 0 0 1 3.5 17v-1A1.5 1.5 0 0 1 5 14.5m10.5.5h-1v2h1zm4 0h-1v2h1zM9.5 2.5a1.5 1.5 0 0 1 0 3h-4v1H9a1.5 1.5 0 1 1 0 3H5.5v1H10a1.5 1.5 0 0 1 0 3H4.1a1.6 1.6 0 0 1-1.6-1.6V4.1a1.6 1.6 0 0 1 1.6-1.6zm7.5 1A3.5 3.5 0 0 1 20.5 7v2a1.5 1.5 0 0 1-3 0V7a.5.5 0 0 0-.5-.5h-3a1.5 1.5 0 0 1 0-3z"></path></g></svg>`
        svg: `<svg enable-background="new 0 0 48 48" height="96" id="Layer_1" version="1.1" viewBox="0 0 48 48" width="96" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path clip-rule="evenodd" d="M44.929,14.391c-0.046,0.099-0.102,0.194-0.183,0.276L16.84,42.572  c-0.109,0.188-0.26,0.352-0.475,0.434l-13.852,3.88c-0.029,0.014-0.062,0.016-0.094,0.026l-0.047,0.014  c-0.008,0.003-0.017,0.001-0.024,0.004c-0.094,0.025-0.187,0.046-0.286,0.045c-0.098,0.003-0.189-0.015-0.282-0.041  c-0.021-0.006-0.04-0.002-0.061-0.009c-0.008-0.003-0.013-0.01-0.021-0.013c-0.088-0.033-0.164-0.083-0.24-0.141  c-0.039-0.028-0.08-0.053-0.113-0.086s-0.058-0.074-0.086-0.113c-0.058-0.075-0.107-0.152-0.141-0.24  c-0.004-0.008-0.01-0.013-0.013-0.021c-0.007-0.02-0.003-0.04-0.009-0.061c-0.025-0.092-0.043-0.184-0.041-0.281  c0-0.1,0.02-0.193,0.045-0.287c0.004-0.008,0.001-0.016,0.004-0.023l0.014-0.049c0.011-0.03,0.013-0.063,0.026-0.093l3.88-13.852  c0.082-0.216,0.246-0.364,0.434-0.475l27.479-27.48c0.04-0.045,0.087-0.083,0.128-0.127l0.299-0.299  c0.015-0.015,0.034-0.02,0.05-0.034C34.858,1.87,36.796,1,38.953,1C43.397,1,47,4.603,47,9.047  C47,11.108,46.205,12.969,44.929,14.391z M41.15,15.5l-3.619-3.619L13.891,35.522c0.004,0.008,0.014,0.011,0.018,0.019l2.373,4.827  L41.15,15.5z M3.559,44.473l2.785-0.779l-2.006-2.005L3.559,44.473z M4.943,39.53l3.558,3.559l6.12-1.715  c0,0-2.586-5.372-2.59-5.374l-5.374-2.59L4.943,39.53z M12.49,34.124c0.008,0.004,0.011,0.013,0.019,0.018L36.15,10.5l-3.619-3.619  L7.663,31.749L12.49,34.124z M38.922,3c-1.782,0-3.372,0.776-4.489,1.994l-0.007-0.007L33.912,5.5l8.619,8.619l0.527-0.528  l-0.006-0.006c1.209-1.116,1.979-2.701,1.979-4.476C45.031,5.735,42.296,3,38.922,3z" fill-rule="evenodd"/></svg>`
        //https://www.iconfinder.com/search?q=write
    },

    {
        name:'wewrite-digest',
        svg:`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 20 20"><path fill="currentColor" d="M1 7h18v2H1zm0 4h14v2H1z"></path></svg>`

    },
    {
        name:'wewrite-send',
        svg: `<svg fill="none" height="67" viewBox="0 0 158 134" width="67" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0)"><path d="M6.72129 53.8326C5.22886 54.369 3.79008 55.0461 2.42414 55.8549C1.99492 56.0692 1.62306 56.3841 1.33985 56.7732C1.05664 57.1622 0.870351 57.614 0.796627 58.0907C0.728141 58.9623 1.18429 59.8347 2.14826 60.6823C2.95005 61.3417 3.81412 61.9203 4.72808 62.4099C5.42909 62.8132 6.14303 63.1944 6.85696 63.575C7.87906 64.1201 8.93607 64.6808 9.92071 65.3035C23.2735 73.7162 35.4245 81.1753 48.7508 87.2021C48.7223 87.6822 48.6907 88.1609 48.6584 88.6377C48.5679 89.9855 48.4749 91.3782 48.4729 92.7533C48.4699 94.8297 48.4618 96.9073 48.4484 98.9863C48.4141 105.578 48.3786 112.395 48.5989 119.098C48.6784 121.515 49.5403 123.243 51.0256 123.964C52.5872 124.719 54.5946 124.279 56.6783 122.719C57.4297 122.156 58.1998 121.524 59.032 120.785C62.6824 117.545 66.3277 114.298 70.0078 111.02L73.343 108.049C73.3682 108.068 73.3927 108.087 73.4153 108.107L76.4991 110.778C80.01 113.816 83.6397 116.957 87.1829 120.08C88.1921 120.967 89.2071 121.85 90.2279 122.727C93.3395 125.417 96.5596 128.198 99.4515 131.179C100.984 132.756 102.474 133.498 104.264 133.498C105.036 133.487 105.803 133.372 106.546 133.158C109.158 132.442 110.843 130.835 112.011 127.954C116.411 117.096 120.915 106.068 125.269 95.4041C128.844 86.644 132.416 77.8832 135.985 69.1212C143.674 50.3116 150.308 31.082 155.854 11.5231C156.526 9.25442 156.998 6.93056 157.266 4.57852C157.355 4.03355 157.322 3.47531 157.169 2.945C157.015 2.41468 156.745 1.92589 156.379 1.51476C155.937 1.11363 155.412 0.817045 154.841 0.646857C154.272 0.476668 153.671 0.437215 153.083 0.531243C152.306 0.62523 151.539 0.799482 150.796 1.05151L150.696 1.08216C149.028 1.58303 147.355 2.06949 145.682 2.5567C141.796 3.6879 137.778 4.85757 133.878 6.19107C105.715 15.8287 77.1517 26.3209 48.9821 37.3766C40.8575 40.564 32.5849 43.7787 24.5844 46.8861C18.6266 49.1966 12.6722 51.5121 6.72129 53.8326ZM60.3339 83.5438C61.8845 82.2395 63.3543 81.0069 64.863 79.8484C70.7773 75.3015 76.6975 70.7617 82.6228 66.2304C94.2653 57.3147 106.305 48.0953 118.081 38.9404C121.682 36.1433 125.099 32.9988 128.404 29.9637C129.539 28.9229 130.673 27.8776 131.816 26.8465C132.728 26.0243 134.254 24.6486 133.408 21.9607C133.38 21.8729 133.335 21.7918 133.275 21.7225C133.215 21.6532 133.141 21.5973 133.059 21.5582C132.976 21.5193 132.886 21.4978 132.794 21.4951C132.703 21.4924 132.612 21.5085 132.527 21.5424C132.174 21.6862 131.833 21.8131 131.504 21.9328C130.819 22.1684 130.152 22.4534 129.508 22.7856C107.655 34.7331 88.645 50.3999 70.2617 65.552C66.1042 68.9781 62.1856 72.5122 58.0409 76.2499C56.2809 77.8377 54.5032 79.432 52.7074 81.0335L11.7046 58.6697C11.9409 58.5229 12.189 58.3963 12.4463 58.2911C19.0407 55.791 25.6326 53.2819 32.2218 50.7636C48.3566 44.61 65.0432 38.2463 81.5231 32.1929C96.1997 26.8017 111.219 21.5788 125.743 16.5278C130.572 14.8487 135.401 13.1663 140.228 11.4807C142.099 10.8263 143.986 10.3144 145.986 9.77318C146.515 9.63008 147.047 9.48508 147.581 9.33807C139.534 35.016 129.269 60.2022 119.336 84.5728C114.116 97.3783 108.723 110.61 103.68 123.835C89.9733 112.724 76.6781 100.978 63.8163 89.6134C62.0792 88.077 60.3384 86.5399 58.5939 85.0022C59.187 84.5045 59.7653 84.0193 60.3319 83.5438H60.3339ZM67.952 103.131L56.1931 113.163L55.2608 91.3281L67.952 103.131Z" fill="black"/></g><defs><clipPath id="clip0"><rect fill="white" height="134" transform="translate(0.777344)" width="157"/></clipPath></defs></svg>`
    }


]

export function loadWeWriteIcons(){
    for(let icon of icons){
        addIcon(icon.name, icon.svg)
    }
}
// width="24" height="24" 
