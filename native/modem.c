// Demmod's streaming adapter for the unmodified SpanDSP V.22/V.22bis engine.
// SpanDSP is dynamically linked (LGPL-2.1); see THIRD_PARTY.md.
#define _POSIX_C_SOURCE 200809L
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <spandsp.h>

#define RATE 8000
#define BLOCK 160
#define MAX_BYTES 72000
typedef struct {
    v22bis_state_t *modem;
    const uint8_t *input;
    int length, sent, frame, sample, trained, training_sample;
    int rx_frame, rx_byte, errors, count, receiving, expected;
    uint8_t bytes[MAX_BYTES];
    double times[MAX_BYTES];
} Endpoint;
static int bit_in(void *user) {
    Endpoint *e=user;
    if (!e->input || e->sample < 4*RATE || e->sent >= e->length) return 1;
    int frame=e->frame++;
    int bit=frame==0 ? 0 : frame==9 ? 1 : (e->input[e->sent]>>(frame-1))&1;
    if (e->frame==10) {e->frame=0; e->sent++;}
    return bit;
}
static void bit_out(void *user, int bit) {
    Endpoint *e=user;
    if (bit<0) {
        if (bit==SIG_STATUS_TRAINING_SUCCEEDED) {
            e->trained=1; e->training_sample=e->sample; e->rx_frame=0;
        }
        if (bit==SIG_STATUS_CARRIER_DOWN) e->rx_frame=0;
        return;
    }
    if (!e->trained) return;
    if (e->rx_frame==0) {
        if (!bit) {e->rx_frame=1; e->rx_byte=0;}
    } else if (e->rx_frame<=8) {
        e->rx_byte|=(bit&1)<<(e->rx_frame-1); e->rx_frame++;
    } else {
        if (bit && e->count<MAX_BYTES) {
            e->bytes[e->count]=e->rx_byte;
            e->times[e->count]=e->sample/(double)RATE;
            e->count++;
        } else e->errors++;
        e->rx_frame=0;
    }
}
static void init(Endpoint *e, int caller, int rate) {
    e->modem=v22bis_init(NULL,rate,V22BIS_GUARD_TONE_NONE,caller,bit_in,e,bit_out,e);
    if (!e->modem) {fprintf(stderr,"Cannot initialize V.22 engine\n"); exit(2);}
}
static void pace(struct timespec start, int samples) {
    long long ns=(long long)samples*1000000000LL/RATE;
    start.tv_sec+=ns/1000000000LL; start.tv_nsec+=ns%1000000000LL;
    if(start.tv_nsec>=1000000000L){start.tv_nsec-=1000000000L;start.tv_sec++;}
    clock_nanosleep(CLOCK_MONOTONIC,TIMER_ABSTIME,&start,NULL);
}
static int transmit(int rate, int caller, int live) {
    uint8_t input[MAX_BYTES+1]; int length=fread(input,1,sizeof(input),stdin);
    double lead=rate==300 ? 1.0 : 4.0, tail=rate==300 ? .2 : .5;
    int maximum=(int)((300-lead-tail)*rate/10);
    if (!length || length>maximum) {fprintf(stderr,"Message exceeds five-minute limit\n");return 2;}
    int total=(int)ceil((lead+10.0*length/rate+tail)*RATE);
    Endpoint a={0},b={0};
    Endpoint *sender=caller?&a:&b, *peer=caller?&b:&a;
    if(rate!=300){init(&a,1,rate);init(&b,0,rate);sender->input=input;sender->length=length;}
    double phase=0; int16_t x[BLOCK],y[BLOCK],out[BLOCK];
    struct timespec start;clock_gettime(CLOCK_MONOTONIC,&start);
    setvbuf(stdout,NULL,_IONBF,0);
    for(int pos=0;pos<total;pos+=BLOCK) {
        int n=total-pos<BLOCK?total-pos:BLOCK;
        if(rate==300) {
            for(int j=0;j<n;j++){
                int sample=pos+j,bit=1;
                if(sample<RATE/5 || sample>=RATE+ceil(10.0*length*RATE/300)) {out[j]=0;continue;}
                if(sample>=RATE) {
                    int k=(int)((int64_t)(sample-RATE)*300/RATE),frame=k%10;
                    bit=frame==0?0:frame==9?1:(input[k/10]>>(frame-1))&1;
                }
                double frequency=caller?(bit?1270:1070):(bit?2225:2025);
                out[j]=(int16_t)lrint(.65*32767*sin(phase));
                phase=fmod(phase+2*3.141592653589793*frequency/RATE,2*3.141592653589793);
            }
        } else {
            a.sample=b.sample=pos;
            v22bis_tx(a.modem,x,n);v22bis_tx(b.modem,y,n);
            for(int j=0;j<n;j++){
                a.sample=b.sample=pos+j;
                v22bis_rx(a.modem,y+j,1);v22bis_rx(b.modem,x+j,1);
            }
            if(pos>=4*RATE && (!a.trained||!b.trained)) {fprintf(stderr,"Training failed\n");return 3;}
            memcpy(out,caller?x:y,n*2);
        }
        if(rate!=300 && pos+n==total && (peer->count!=length || memcmp(peer->bytes,input,length))) {
            fprintf(stderr,"Reference peer did not recover payload\n");return 5;
        }
        // Explicit little endian PCM.
        unsigned char raw[BLOCK*2];
        for(int j=0;j<n;j++){uint16_t v=(uint16_t)out[j];raw[j*2]=v&255;raw[j*2+1]=v>>8;}
        if(fwrite(raw,1,n*2,stdout)!=(size_t)n*2)return 4;
        if(ferror(stdout))return 4;
        if(live)pace(start,pos+n);
    }
    if(rate!=300) {
        int ok=peer->count==length && !memcmp(peer->bytes,input,length);
        v22bis_free(a.modem);v22bis_free(b.modem);
        if(!ok){fprintf(stderr,"Reference peer did not recover the complete payload\n");return 5;}
    }
    return 0;
}
static int receive(int requested) {
    Endpoint a={0},b={0};init(&a,1,2400);init(&b,0,2400);
    int16_t input[BLOCK],dummy[BLOCK];unsigned char raw[BLOCK*2];int pos=0,n;
    while((n=fread(raw,1,sizeof(raw),stdin))>0){
        if(n%2 || pos+n/2>300*RATE){fprintf(stderr,"Invalid PCM duration\n");return 2;}
        n/=2;
        for(int j=0;j<n;j++)input[j]=(int16_t)((uint16_t)raw[j*2]|(uint16_t)raw[j*2+1]<<8);
        a.sample=b.sample=pos;
        v22bis_tx(a.modem,dummy,n);v22bis_tx(b.modem,dummy,n);
        for(int j=0;j<n;j++){a.sample=b.sample=pos+j;v22bis_rx(a.modem,input+j,1);v22bis_rx(b.modem,input+j,1);}
        pos+=n;
    }
    Endpoint *best=a.count>=b.count?&a:&b;
    int rate=v22bis_get_current_bit_rate(best->modem);
    if(!best->trained || !best->count || (requested && requested!=rate)){
        puts("{\"error\":\"No matching V.22/V.22bis data found.\"}");return 0;
    }
    printf("{\"rate\":%d,\"channel\":\"%s\",\"errors\":%d,\"trained\":true,\"bytes\":[",rate,best==&a?"answer":"originate",best->errors);
    for(int i=0;i<best->count;i++)printf("%s%d",i?",":"",best->bytes[i]);
    printf("],\"times\":[");
    for(int i=0;i<best->count;i++)printf("%s%.6f",i?",":"",best->times[i]);
    puts("]}");v22bis_free(a.modem);v22bis_free(b.modem);return 0;
}
int main(int argc,char **argv) {
    if(argc<3)return 2;
    int rate=atoi(argv[2]);
    if(!strcmp(argv[1],"decode") && (rate==0||rate==1200||rate==2400))return receive(rate);
    if(argc!=5 || strcmp(argv[1],"encode") || (rate!=300&&rate!=1200&&rate!=2400))return 2;
    return transmit(rate,!strcmp(argv[3],"originate"),!strcmp(argv[4],"live"));
}
