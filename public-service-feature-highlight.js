(() => {
  function applyFeatureHighlight(){
    const panel = document.getElementById('myServicesPanel');
    if(!panel) return;

    panel.classList.add('featured-service-checker');

    const summary = panel.querySelector(':scope > summary');
    if(!summary) return;

    summary.classList.add('featured-service-summary');
    summary.innerHTML = `
      <span class="featured-service-icon" aria-hidden="true">✓</span>
      <span class="featured-service-copy">
        <span class="featured-service-title-row">
          <strong>自分の利用サービスをチェック</strong>
          <span class="featured-service-badge">おすすめ機能</span>
        </span>
        <span class="featured-service-subtitle">
          利用中のサービスから、自分に関連する漏えい案件だけ確認できます
        </span>
      </span>
      <span class="featured-service-chevron" aria-hidden="true"></span>
    `;

    if(document.getElementById('featuredServiceStyles')) return;

    const style = document.createElement('style');
    style.id = 'featuredServiceStyles';
    style.textContent = `
      #myServicesPanel.featured-service-checker{
        position:relative;
        border:1px solid #b9c8ff;
        border-left:4px solid #2447d8;
        background:
          linear-gradient(90deg, rgba(36,71,216,.055), rgba(36,71,216,.012) 42%, #fff 72%);
        box-shadow:0 7px 22px rgba(36,71,216,.07);
        transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }

      #myServicesPanel.featured-service-checker:hover{
        border-color:#96abff;
        border-left-color:#2447d8;
        box-shadow:0 9px 26px rgba(36,71,216,.11);
      }

      #myServicesPanel.featured-service-checker[open]{
        background:#fff;
        border-color:#aebeff;
        border-left-color:#2447d8;
      }

      #myServicesPanel .featured-service-summary{
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        gap:11px;
        min-height:42px;
        color:#172033;
        cursor:pointer;
        list-style:none;
      }

      #myServicesPanel .featured-service-summary::-webkit-details-marker{
        display:none;
      }

      #myServicesPanel .featured-service-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:30px;
        height:30px;
        flex:0 0 30px;
        border-radius:50%;
        background:#2447d8;
        color:#fff;
        font-size:16px;
        font-weight:900;
        box-shadow:0 4px 10px rgba(36,71,216,.22);
      }

      #myServicesPanel .featured-service-copy{
        display:grid;
        gap:3px;
        min-width:0;
      }

      #myServicesPanel .featured-service-title-row{
        display:flex;
        align-items:center;
        gap:9px;
        flex-wrap:wrap;
      }

      #myServicesPanel .featured-service-title-row strong{
        color:#183cab;
        font-size:16px;
        line-height:1.35;
        letter-spacing:.01em;
      }

      #myServicesPanel .featured-service-badge{
        display:inline-flex;
        align-items:center;
        padding:3px 8px;
        border-radius:999px;
        background:#eef4ff;
        border:1px solid #c7d7fe;
        color:#2447d8;
        font-size:10px;
        line-height:1.3;
        font-weight:800;
        white-space:nowrap;
      }

      #myServicesPanel .featured-service-subtitle{
        color:#657087;
        font-size:12px;
        line-height:1.45;
        font-weight:500;
      }

      #myServicesPanel .featured-service-chevron{
        width:9px;
        height:9px;
        border-right:2px solid #6b7dbf;
        border-bottom:2px solid #6b7dbf;
        transform:rotate(45deg);
        margin:0 5px 5px 8px;
        transition:transform .18s ease, margin .18s ease;
      }

      #myServicesPanel[open] .featured-service-chevron{
        transform:rotate(225deg);
        margin-top:6px;
        margin-bottom:0;
      }

      #myServicesPanel[open] > .service-intro{
        margin-top:15px;
      }

      @media(max-width:700px){
        #myServicesPanel .featured-service-summary{
          grid-template-columns:auto 1fr auto;
          gap:9px;
        }

        #myServicesPanel .featured-service-icon{
          width:28px;
          height:28px;
          flex-basis:28px;
        }

        #myServicesPanel .featured-service-title-row strong{
          font-size:14px;
        }

        #myServicesPanel .featured-service-subtitle{
          font-size:11px;
        }

        #myServicesPanel .featured-service-badge{
          font-size:9px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyFeatureHighlight, {once:true});
  }else{
    applyFeatureHighlight();
  }
})();
